/**
 * Crypto Fear & Greed Index from alternative.me — free, no key.
 */
import { getJson } from '../http.js';

export async function fearGreed(days = 7) {
  const data = await getJson(`https://api.alternative.me/fng/?limit=${days}`, { ttlMs: 600000 });
  return (data.data || []).map(d => ({
    value: Number(d.value),
    label: d.value_classification,
    date: new Date(Number(d.timestamp) * 1000).toISOString().slice(0, 10),
  }));
}
