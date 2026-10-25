/**
 * Birdeye — needs BIRDEYE_API_KEY (free tier: 30K compute units/month, 1 req/s).
 * Used for DEX-token OHLCV when the key is set; otherwise GeckoTerminal is used.
 */
import { getJson } from '../http.js';

const BASE = 'https://public-api.birdeye.so';

export const hasKey = () => !!process.env.BIRDEYE_API_KEY;

// Birdeye candle types, in minutes.
const TYPES = [[1, '1m'], [3, '3m'], [5, '5m'], [15, '15m'], [30, '30m'], [60, '1H'], [120, '2H'], [240, '4H'], [360, '6H'], [480, '8H'], [720, '12H'], [1440, '1D'], [4320, '3D'], [10080, '1W']];

export function candleType(minutes) {
  let best = TYPES[0];
  for (const t of TYPES) if (t[0] <= minutes) best = t;
  return best;
}

export async function ohlcv(chain, tokenAddress, minutes, limit) {
  const [size, type] = candleType(minutes);
  const to = Math.floor(Date.now() / 1000);
  const from = to - size * 60 * Math.min(limit, 1000);
  const url = `${BASE}/defi/ohlcv?address=${tokenAddress}&type=${type}&time_from=${from}&time_to=${to}`;
  const data = await getJson(url, { headers: { 'X-API-KEY': process.env.BIRDEYE_API_KEY, 'x-chain': chain }, ttlMs: 30000 });
  if (data.success === false) throw new Error(`Birdeye: ${data.message || 'request failed'}`);
  const bars = (data.data?.items || []).map(i => ({ time: i.unixTime, open: i.o, high: i.h, low: i.l, close: i.c, volume: i.v }));
  return { bars, actual_timeframe: size >= 1440 ? (size === 1440 ? 'D' : type) : String(size) };
}
