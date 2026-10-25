/**
 * Technical indicators computed locally from OHLCV bars.
 * Each series function returns an array aligned with the input (null until warmed up).
 * Formulas follow TradingView's built-ins (RSI/ATR use Wilder's smoothing).
 */
import { loadBars, roundPrice, iso } from './data.js';

export function sma(values, length) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= length) sum -= values[i - length];
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

export function ema(values, length) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (length + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (values[i] == null) continue;
    if (prev == null) {
      // Seed with the SMA of the first `length` non-null values, like TradingView.
      const start = values.findIndex(v => v != null);
      if (i - start + 1 < length) continue;
      prev = values.slice(start, i + 1).reduce((a, b) => a + b, 0) / length;
    } else {
      prev = values[i] * k + prev * (1 - k);
    }
    out[i] = prev;
  }
  return out;
}

function wilder(values, length) {
  const out = new Array(values.length).fill(null);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    if (i < length - 1) continue;
    if (prev == null) prev = values.slice(i - length + 1, i + 1).reduce((a, b) => a + b, 0) / length;
    else prev = (prev * (length - 1) + values[i]) / length;
    out[i] = prev;
  }
  return out;
}

export function rsi(closes, length = 14) {
  const gains = [0], losses = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = wilder(gains.slice(1), length), l = wilder(losses.slice(1), length);
  return [null, ...g.map((gv, i) => (gv == null ? null : l[i] === 0 ? 100 : 100 - 100 / (1 + gv / l[i])))];
}

export function macd(closes, fast = 12, slow = 26, signal = 9) {
  const f = ema(closes, fast), s = ema(closes, slow);
  const line = f.map((v, i) => (v == null || s[i] == null ? null : v - s[i]));
  const sig = ema(line, signal);
  return { macd: line, signal: sig, histogram: line.map((v, i) => (v == null || sig[i] == null ? null : v - sig[i])) };
}

export function bollinger(closes, length = 20, mult = 2) {
  const mid = sma(closes, length);
  const upper = [], lower = [];
  for (let i = 0; i < closes.length; i++) {
    if (mid[i] == null) { upper.push(null); lower.push(null); continue; }
    const win = closes.slice(i - length + 1, i + 1);
    const sd = Math.sqrt(win.reduce((a, v) => a + (v - mid[i]) ** 2, 0) / length);
    upper.push(mid[i] + mult * sd);
    lower.push(mid[i] - mult * sd);
  }
  return { upper, middle: mid, lower };
}

export function atr(bars, length = 14) {
  const tr = bars.map((b, i) => (i === 0 ? b.high - b.low
    : Math.max(b.high - b.low, Math.abs(b.high - bars[i - 1].close), Math.abs(b.low - bars[i - 1].close))));
  return wilder(tr, length);
}

export function stochastic(bars, kLength = 14, smooth = 3, dLength = 3) {
  const raw = bars.map((b, i) => {
    if (i < kLength - 1) return null;
    const win = bars.slice(i - kLength + 1, i + 1);
    const hh = Math.max(...win.map(x => x.high)), ll = Math.min(...win.map(x => x.low));
    return hh === ll ? 50 : ((b.close - ll) / (hh - ll)) * 100;
  });
  const k = smaNullable(raw, smooth);
  return { k, d: smaNullable(k, dLength) };
}

function smaNullable(values, length) {
  return values.map((_, i) => {
    const win = values.slice(Math.max(0, i - length + 1), i + 1);
    return win.length === length && win.every(v => v != null) ? win.reduce((a, b) => a + b, 0) / length : null;
  });
}

/** VWAP over the loaded bars (anchored at the first bar). Needs volume. */
export function vwap(bars) {
  let pv = 0, vol = 0;
  return bars.map(b => {
    if (b.volume == null) return null;
    pv += ((b.high + b.low + b.close) / 3) * b.volume;
    vol += b.volume;
    return vol ? pv / vol : null;
  });
}

const last = (arr) => arr[arr.length - 1];
const prev = (arr) => arr[arr.length - 2];

/**
 * Indicator spec strings: "rsi", "rsi:7", "ema:50", "sma:200", "macd", "macd:8:21:5",
 * "bb", "bb:20:2.5", "atr", "stoch", "vwap".
 */
export const DEFAULT_INDICATORS = ['rsi', 'ema:20', 'ema:50', 'ema:200', 'macd', 'bb', 'atr', 'stoch', 'vwap'];

export function compute(bars, specs = DEFAULT_INDICATORS) {
  const closes = bars.map(b => b.close);
  const price = last(closes);
  const out = {};
  const warnings = [];

  for (const spec of specs) {
    const [name, ...params] = String(spec).toLowerCase().split(':');
    const p = params.map(Number);
    const key = spec.toLowerCase();
    switch (name) {
      case 'rsi': {
        const s = rsi(closes, p[0] || 14);
        const v = last(s);
        out[key] = v == null ? null : { value: round(v), state: v >= 70 ? 'overbought' : v <= 30 ? 'oversold' : 'neutral' };
        break;
      }
      case 'ema': case 'sma': {
        const len = p[0] || 20;
        const v = last(name === 'ema' ? ema(closes, len) : sma(closes, len));
        out[key] = v == null ? null : { value: roundPrice(v), price_vs: price > v ? 'above' : 'below', distance_pct: round(((price - v) / v) * 100) };
        break;
      }
      case 'macd': {
        const m = macd(closes, p[0] || 12, p[1] || 26, p[2] || 9);
        const h = last(m.histogram), hp = prev(m.histogram);
        out[key] = h == null ? null : {
          macd: roundPrice(last(m.macd)), signal: roundPrice(last(m.signal)), histogram: roundPrice(h),
          cross: hp != null && Math.sign(h) !== Math.sign(hp) ? (h > 0 ? 'bullish_cross' : 'bearish_cross') : null,
          momentum: hp == null ? null : h > hp ? 'rising' : 'falling',
        };
        break;
      }
      case 'bb': {
        const b = bollinger(closes, p[0] || 20, p[1] || 2);
        const u = last(b.upper), l = last(b.lower);
        out[key] = u == null ? null : {
          upper: roundPrice(u), middle: roundPrice(last(b.middle)), lower: roundPrice(l),
          percent_b: round((price - l) / (u - l)), bandwidth_pct: round(((u - l) / last(b.middle)) * 100),
        };
        break;
      }
      case 'atr': {
        const v = last(atr(bars, p[0] || 14));
        out[key] = v == null ? null : { value: roundPrice(v), pct_of_price: round((v / price) * 100) };
        break;
      }
      case 'stoch': {
        const s = stochastic(bars, p[0] || 14, p[1] || 3, p[2] || 3);
        const k = last(s.k);
        out[key] = k == null ? null : { k: round(k), d: round(last(s.d)), state: k >= 80 ? 'overbought' : k <= 20 ? 'oversold' : 'neutral' };
        break;
      }
      case 'vwap': {
        const v = last(vwap(bars));
        if (v == null) warnings.push('vwap needs per-candle volume (not available from CoinGecko OHLC — use a token address)');
        out[key] = v == null ? null : { value: roundPrice(v), price_vs: price > v ? 'above' : 'below' };
        break;
      }
      default:
        warnings.push(`unknown indicator "${spec}"`);
    }
    if (out[key] === null && name !== 'vwap') warnings.push(`${spec}: not enough bars (${bars.length}) to compute`);
  }
  return { values: out, warnings };
}

export async function getIndicators({ symbol, timeframe, indicators, count, source }) {
  const r = await loadBars({ symbol, timeframe, count: count || 300, source });
  const { values, warnings } = compute(r.bars, indicators?.length ? indicators : DEFAULT_INDICATORS);
  const lastBar = r.bars[r.bars.length - 1];
  return {
    success: true, symbol: r.asset.symbol, source: r.source, timeframe: r.actual_timeframe,
    price: lastBar.close, as_of: iso(lastBar.time), bars_used: r.bars.length,
    indicators: values, ...(warnings.length && { warnings }),
  };
}

function round(n) { return n == null || !isFinite(n) ? null : Math.round(n * 100) / 100; }
