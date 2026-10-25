/**
 * One-call chart analysis: quote + price summary + indicators + support/resistance + trend.
 * Replaces the TradingView "read my chart" workflow (chart_get_state + study values + pine lines).
 */
import { loadBars, summarize, roundPrice, iso } from './data.js';
import { compute, ema } from './indicators.js';

/**
 * Swing-pivot levels: a bar whose high (low) is the extreme of `width` bars on each side.
 * Nearby pivots are merged into one level and ranked by how often price touched them.
 */
export function findLevels(bars, { width = 3, mergePct = 0.6, max = 4 } = {}) {
  const pivots = [];
  for (let i = width; i < bars.length - width; i++) {
    const win = bars.slice(i - width, i + width + 1);
    if (bars[i].high === Math.max(...win.map(b => b.high))) pivots.push(bars[i].high);
    if (bars[i].low === Math.min(...win.map(b => b.low))) pivots.push(bars[i].low);
  }
  const clusters = [];
  for (const p of pivots.sort((a, b) => a - b)) {
    const c = clusters[clusters.length - 1];
    if (c && (p - c.avg) / c.avg * 100 <= mergePct) {
      c.sum += p; c.touches++; c.avg = c.sum / c.touches;
    } else clusters.push({ sum: p, touches: 1, avg: p });
  }
  const price = bars[bars.length - 1].close;
  const level = (c) => ({ price: roundPrice(c.avg), touches: c.touches, distance_pct: Math.round(((c.avg - price) / price) * 10000) / 100 });
  const byStrength = (a, b) => b.touches - a.touches || Math.abs(a.distance_pct) - Math.abs(b.distance_pct);
  return {
    resistance: clusters.filter(c => c.avg > price).map(level).sort(byStrength).slice(0, max).sort((a, b) => a.price - b.price),
    support: clusters.filter(c => c.avg <= price).map(level).sort(byStrength).slice(0, max).sort((a, b) => b.price - a.price),
  };
}

export function trend(bars) {
  const closes = bars.map(b => b.close);
  const price = closes[closes.length - 1];
  const e20 = ema(closes, 20).at(-1), e50 = ema(closes, 50).at(-1);
  if (e20 == null || e50 == null) return { direction: 'unknown', reason: 'need at least 50 bars' };
  if (price > e20 && e20 > e50) return { direction: 'up', reason: 'price > EMA20 > EMA50' };
  if (price < e20 && e20 < e50) return { direction: 'down', reason: 'price < EMA20 < EMA50' };
  return { direction: 'sideways', reason: 'EMAs and price not stacked' };
}

export async function analyze({ symbol, timeframe, count, source }) {
  const r = await loadBars({ symbol, timeframe, count: count || 300, source });
  const { values, warnings } = compute(r.bars);
  const recent = r.bars.slice(-100);
  return {
    success: true,
    symbol: r.asset.symbol, name: r.asset.name, source: r.source, timeframe: r.actual_timeframe,
    ...(r.asset.kind === 'dex' && { chain: r.asset.chain, address: r.asset.address, liquidity_usd: r.asset.pair.liquidity_usd }),
    price: r.bars.at(-1).close, as_of: iso(r.bars.at(-1).time),
    trend: trend(r.bars),
    summary_last_100: { ...summarize(recent), last_5_bars: undefined },
    levels: findLevels(recent),
    indicators: values,
    ...(r.note && { note: r.note }),
    ...(warnings.length && { warnings }),
  };
}
