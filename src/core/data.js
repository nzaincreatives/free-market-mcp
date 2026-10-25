/**
 * Price data: quotes and OHLCV bars from free sources.
 *
 * Source choice for OHLCV:
 *   DEX token → Birdeye (if BIRDEYE_API_KEY is set) → GeckoTerminal (free)
 *   Coin      → CoinGecko OHLC (30 min / 4 h / 4 day candles, no per-candle volume)
 */
import { resolve, parseTimeframe, formatTimeframe } from './resolve.js';
import * as coingecko from '../sources/coingecko.js';
import * as geckoterminal from '../sources/geckoterminal.js';
import * as birdeye from '../sources/birdeye.js';

export const MAX_OHLCV_BARS = 1000;

export function roundPrice(n) {
  if (n == null || !isFinite(n)) return n;
  const abs = Math.abs(n);
  // Micro-cap tokens trade at 1e-6 and below, so keep significant digits there.
  if (abs < 1) return Number(n.toPrecision(6));
  return Number(n.toFixed(abs >= 1000 ? 2 : 4));
}

export async function getQuote({ symbol }) {
  const asset = await resolve(symbol);
  if (asset.kind === 'coin') {
    const q = await coingecko.quote(asset.id);
    return { success: true, symbol: asset.symbol, name: asset.name, id: asset.id, source: 'coingecko', ...q };
  }
  const p = asset.pair;
  return {
    success: true, symbol: asset.symbol, name: asset.name, chain: asset.chain, address: asset.address, source: 'dexscreener',
    price: p.price, change_1h_pct: p.change_1h_pct, change_24h_pct: p.change_24h_pct,
    volume_24h: p.volume_24h, liquidity_usd: p.liquidity_usd, market_cap: p.market_cap,
    txns_24h: p.txns_24h, pair: `${p.base.symbol}/${p.quote.symbol} on ${p.dex}`, url: p.url,
  };
}

async function fetchBars(asset, minutes, limit, source) {
  const want = source && source !== 'auto' ? source : null;

  if (asset.kind === 'dex') {
    if ((want === 'birdeye' || (!want && birdeye.hasKey()))) {
      if (!birdeye.hasKey()) throw new Error('source=birdeye needs BIRDEYE_API_KEY');
      return { ...(await birdeye.ohlcv(asset.chain, asset.address, minutes, limit)), source: 'birdeye' };
    }
    if (want && want !== 'geckoterminal') throw new Error(`source=${want} is not available for DEX tokens (use geckoterminal or birdeye)`);
    return { ...(await geckoterminal.ohlcv(asset.chain, asset.pair.pair_address, minutes, limit)), source: 'geckoterminal', pool: asset.pair.pair_address };
  }

  if (want === 'birdeye' || want === 'geckoterminal') {
    throw new Error(`source=${want} needs a token address (e.g. solana:<mint>), not a coin name`);
  }
  return { ...(await coingecko.ohlc(asset.id, minutes)), source: 'coingecko' };
}

/** Shared by data, indicator, analysis and backtest tools. */
export async function loadBars({ symbol, timeframe, count, source }) {
  const minutes = parseTimeframe(timeframe);
  const limit = Math.min(count || 100, MAX_OHLCV_BARS);
  const asset = await resolve(symbol);
  const res = await fetchBars(asset, minutes, limit, source);
  if (!res.bars.length) throw new Error(`No bars returned for ${symbol} (${res.source})`);
  const bars = res.bars.slice(-limit);
  return {
    asset, bars, source: res.source, pool: res.pool, note: res.note,
    requested_timeframe: formatTimeframe(minutes), actual_timeframe: res.actual_timeframe,
  };
}

export function summarize(bars) {
  const first = bars[0];
  const last = bars[bars.length - 1];
  const high = Math.max(...bars.map(b => b.high));
  const low = Math.min(...bars.map(b => b.low));
  const vols = bars.map(b => b.volume).filter(v => v != null);
  return {
    bar_count: bars.length,
    period: { from: iso(first.time), to: iso(last.time) },
    open: first.open, close: last.close, high, low,
    range: roundPrice(high - low),
    change: roundPrice(last.close - first.open),
    change_pct: Math.round(((last.close - first.open) / first.open) * 10000) / 100 + '%',
    avg_volume: vols.length ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length) : null,
    last_5_bars: bars.slice(-5),
  };
}

export async function getOhlcv({ symbol, timeframe, count, summary, source }) {
  const r = await loadBars({ symbol, timeframe, count, source });
  const meta = {
    success: true, symbol: r.asset.symbol, name: r.asset.name, source: r.source,
    timeframe: r.actual_timeframe,
    ...(r.actual_timeframe !== r.requested_timeframe && { requested_timeframe: r.requested_timeframe }),
    ...(r.note && { note: r.note }),
  };
  if (summary) return { ...meta, ...summarize(r.bars) };
  return { ...meta, bar_count: r.bars.length, bars: r.bars };
}

export const iso = (t) => new Date(t * 1000).toISOString().replace('.000Z', 'Z');
