/**
 * DexScreener — free, no key (≈300 calls/min). Live DEX prices, liquidity, buys/sells.
 * Has no candle endpoint; OHLCV for DEX tokens comes from GeckoTerminal or Birdeye.
 */
import { getJson } from '../http.js';

const BASE = 'https://api.dexscreener.com';

function mapPair(p) {
  return {
    chain: p.chainId,
    dex: p.dexId,
    pair_address: p.pairAddress,
    base: { address: p.baseToken?.address, symbol: p.baseToken?.symbol, name: p.baseToken?.name },
    quote: { address: p.quoteToken?.address, symbol: p.quoteToken?.symbol },
    price: p.priceUsd != null ? Number(p.priceUsd) : null,
    change_24h_pct: p.priceChange?.h24 ?? null,
    change_1h_pct: p.priceChange?.h1 ?? null,
    volume_24h: p.volume?.h24 ?? null,
    liquidity_usd: p.liquidity?.usd ?? null,
    market_cap: p.marketCap ?? p.fdv ?? null,
    txns_24h: p.txns?.h24 ?? null,
    url: p.url,
  };
}

// Rank by 24h volume, then liquidity: fake/copycat pools often report huge
// liquidity with almost no trading, and real price discovery follows volume.
const byActivity = (a, b) => (b.volume_24h || 0) - (a.volume_24h || 0) || (b.liquidity_usd || 0) - (a.liquidity_usd || 0);

export async function search(query) {
  const data = await getJson(`${BASE}/latest/dex/search?q=${encodeURIComponent(query)}`, { ttlMs: 60000 });
  return (data.pairs || []).map(mapPair).sort(byActivity);
}

/** All pairs of a token on one chain, most traded first. */
export async function tokenPairs(chain, tokenAddress) {
  const data = await getJson(`${BASE}/token-pairs/v1/${chain}/${tokenAddress}`, { ttlMs: 15000 });
  return (Array.isArray(data) ? data : data.pairs || []).map(mapPair).sort(byActivity);
}
