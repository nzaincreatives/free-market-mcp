/**
 * Simple long-only backtester for a few built-in strategies.
 * Replaces TradingView's Strategy Tester for quick "would this have worked" checks.
 * Entries/exits fill at the close of the signal bar; fees are charged per side.
 */
import { loadBars, roundPrice, iso } from './data.js';
import { ema, sma, rsi, bollinger, macd } from './indicators.js';

export const STRATEGIES = {
  ema_cross: { params: { fast: 9, slow: 21 }, describe: 'Buy when fast EMA crosses above slow EMA, sell on cross below' },
  sma_cross: { params: { fast: 50, slow: 200 }, describe: 'Buy on golden cross (fast SMA over slow SMA), sell on death cross' },
  rsi_reversion: { params: { length: 14, buy_below: 30, sell_above: 70 }, describe: 'Buy when RSI drops below buy_below, sell when it rises above sell_above' },
  bb_reversion: { params: { length: 20, mult: 2 }, describe: 'Buy on close below lower Bollinger Band, sell on close above the middle band' },
  macd_cross: { params: { fast: 12, slow: 26, signal: 9 }, describe: 'Buy when MACD crosses above its signal line, sell on cross below' },
};

/** Returns per-bar signals: 1 = enter long, -1 = exit, 0 = nothing. */
export function signals(bars, strategy, p) {
  const c = bars.map(b => b.close);
  const cross = (a, b, i) => a[i - 1] != null && b[i - 1] != null && a[i] != null && b[i] != null
    ? (a[i - 1] <= b[i - 1] && a[i] > b[i] ? 1 : a[i - 1] >= b[i - 1] && a[i] < b[i] ? -1 : 0) : 0;

  switch (strategy) {
    case 'ema_cross': { const f = ema(c, p.fast), s = ema(c, p.slow); return c.map((_, i) => cross(f, s, i)); }
    case 'sma_cross': { const f = sma(c, p.fast), s = sma(c, p.slow); return c.map((_, i) => cross(f, s, i)); }
    case 'macd_cross': { const m = macd(c, p.fast, p.slow, p.signal); return c.map((_, i) => cross(m.macd, m.signal, i)); }
    case 'rsi_reversion': {
      const r = rsi(c, p.length);
      return r.map(v => (v == null ? 0 : v < p.buy_below ? 1 : v > p.sell_above ? -1 : 0));
    }
    case 'bb_reversion': {
      const b = bollinger(c, p.length, p.mult);
      return c.map((v, i) => (b.lower[i] == null ? 0 : v < b.lower[i] ? 1 : v > b.middle[i] ? -1 : 0));
    }
    default: throw new Error(`Unknown strategy "${strategy}". Available: ${Object.keys(STRATEGIES).join(', ')}`);
  }
}

export function simulate(bars, sig, { feePct = 0.1, stopLossPct, takeProfitPct } = {}) {
  const trades = [];
  let pos = null;
  let equity = 1, peak = 1, maxDd = 0;
  const fee = feePct / 100;

  const close = (i, price, reason) => {
    const ret = (price / pos.price) * (1 - fee) * (1 - fee) - 1;
    equity *= 1 + ret;
    trades.push({ entry_time: iso(bars[pos.i].time), entry: roundPrice(pos.price), exit_time: iso(bars[i].time), exit: roundPrice(price), return_pct: r2(ret * 100), bars_held: i - pos.i, reason });
    pos = null;
  };

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];
    if (pos) {
      if (stopLossPct && b.low <= pos.price * (1 - stopLossPct / 100)) close(i, pos.price * (1 - stopLossPct / 100), 'stop_loss');
      else if (takeProfitPct && b.high >= pos.price * (1 + takeProfitPct / 100)) close(i, pos.price * (1 + takeProfitPct / 100), 'take_profit');
      else if (sig[i] === -1) close(i, b.close, 'signal');
    } else if (sig[i] === 1) {
      pos = { i, price: b.close };
    }
    const mark = pos ? equity * (b.close / pos.price) : equity;
    peak = Math.max(peak, mark);
    maxDd = Math.max(maxDd, (peak - mark) / peak);
  }
  const open = pos ? { entry_time: iso(bars[pos.i].time), entry: roundPrice(pos.price), unrealized_pct: r2((bars.at(-1).close / pos.price - 1) * 100) } : null;

  const wins = trades.filter(t => t.return_pct > 0);
  const losses = trades.filter(t => t.return_pct <= 0);
  const sum = (arr) => arr.reduce((a, t) => a + t.return_pct, 0);
  return {
    total_return_pct: r2((equity - 1) * 100),
    buy_and_hold_pct: r2((bars.at(-1).close / bars[0].close - 1) * 100),
    trades_count: trades.length,
    win_rate_pct: trades.length ? r2((wins.length / trades.length) * 100) : null,
    avg_win_pct: wins.length ? r2(sum(wins) / wins.length) : null,
    avg_loss_pct: losses.length ? r2(sum(losses) / losses.length) : null,
    profit_factor: losses.length && sum(losses) !== 0 ? r2(sum(wins) / Math.abs(sum(losses))) : null,
    max_drawdown_pct: r2(maxDd * 100),
    open_position: open,
    trades,
  };
}

export async function runBacktest({ symbol, timeframe, strategy, params, count, fee_pct, stop_loss_pct, take_profit_pct, max_trades, source }) {
  const def = STRATEGIES[strategy];
  if (!def) throw new Error(`Unknown strategy "${strategy}". Available: ${Object.keys(STRATEGIES).join(', ')}`);
  const p = { ...def.params, ...(params || {}) };
  const r = await loadBars({ symbol, timeframe, count: count || 1000, source });
  const res = simulate(r.bars, signals(r.bars, strategy, p), { feePct: fee_pct ?? 0.1, stopLossPct: stop_loss_pct, takeProfitPct: take_profit_pct });
  const limit = max_trades ?? 20;
  return {
    success: true, symbol: r.asset.symbol, source: r.source, timeframe: r.actual_timeframe,
    strategy, rules: def.describe, params: p, fee_pct: fee_pct ?? 0.1,
    period: { from: iso(r.bars[0].time), to: iso(r.bars.at(-1).time), bars: r.bars.length },
    ...res,
    trades: res.trades.slice(-limit),
    ...(res.trades.length > limit && { trades_note: `showing last ${limit} of ${res.trades.length} trades` }),
    disclaimer: 'Backtest on past data only; fills at bar close, no slippage modelling. Not financial advice.',
  };
}

function r2(n) { return n == null || !isFinite(n) ? null : Math.round(n * 100) / 100; }
