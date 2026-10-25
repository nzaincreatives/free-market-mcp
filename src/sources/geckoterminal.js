/**
 * GeckoTerminal — CoinGecko's free DEX API, no key needed (≈30 calls/min).
 * Real OHLCV with volume for any DEX pool on 100+ networks.
 */
import { getJson } from '../http.js';

const BASE = 'https://api.geckoterminal.com/api/v2';

// DexScreener chain ids → GeckoTerminal network ids where they differ.
const NETWORK_ALIASES = { ethereum: 'eth', bsc: 'bsc', polygon: 'polygon_pos', avalanche: 'avax', arbitrum: 'arbitrum', base: 'base', solana: 'solana' };
export const toNetwork = (chain) => NETWORK_ALIASES[chain] || chain;

/** Most liquid pool for a token (GeckoTerminal sorts by liquidity/volume). */
export async function topPool(network, tokenAddress) {
  const data = await getJson(`${BASE}/networks/${toNetwork(network)}/tokens/${tokenAddress}/pools?page=1`, { ttlMs: 300000 });
  const pool = data.data?.[0];
  if (!pool) return null;
  return { address: pool.attributes.address, name: pool.attributes.name, liquidity_usd: Number(pool.attributes.reserve_in_usd) || null };
}

/** Pick GeckoTerminal's period + aggregate for a timeframe in minutes. */
export function period(minutes) {
  if (minutes < 60) {
    const agg = [15, 5, 1].find(a => minutes >= a && minutes % a === 0) || 1;
    return { timeframe: 'minute', aggregate: agg, actual: String(agg) };
  }
  if (minutes < 1440) {
    const hours = minutes / 60;
    const agg = [12, 4, 1].find(a => hours >= a && hours % a === 0) || 1;
    return { timeframe: 'hour', aggregate: agg, actual: String(agg * 60) };
  }
  return { timeframe: 'day', aggregate: 1, actual: 'D' };
}

export async function ohlcv(network, poolAddress, minutes, limit) {
  const p = period(minutes);
  const url = `${BASE}/networks/${toNetwork(network)}/pools/${poolAddress}/ohlcv/${p.timeframe}?aggregate=${p.aggregate}&limit=${Math.min(limit, 1000)}&currency=usd`;
  const data = await getJson(url, { ttlMs: 30000 });
  const rows = data.data?.attributes?.ohlcv_list || [];
  // GeckoTerminal returns newest first.
  const bars = rows.map(([t, o, h, l, c, v]) => ({ time: t, open: o, high: h, low: l, close: c, volume: v })).sort((a, b) => a.time - b.time);
  return { bars, actual_timeframe: p.actual };
}
