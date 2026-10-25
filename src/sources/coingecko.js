/**
 * CoinGecko — free public API, no key needed (≈30 calls/min).
 * Set COINGECKO_API_KEY (demo key) for higher limits.
 */
import { getJson } from '../http.js';

const BASE = 'https://api.coingecko.com/api/v3';

function headers() {
  const key = process.env.COINGECKO_API_KEY;
  return key ? { 'x-cg-demo-api-key': key } : {};
}

const get = (path, ttlMs) => getJson(BASE + path, { headers: headers(), ttlMs });

export async function search(query) {
  const data = await get(`/search?query=${encodeURIComponent(query)}`, 300000);
  return (data.coins || []).map(c => ({ id: c.id, symbol: c.symbol, name: c.name, rank: c.market_cap_rank ?? null }));
}

// Common tickers resolved without a search call (the free tier is ~30 calls/min).
const KNOWN = {
  btc: ['bitcoin', 'Bitcoin'], eth: ['ethereum', 'Ethereum'], sol: ['solana', 'Solana'], bnb: ['binancecoin', 'BNB'],
  xrp: ['ripple', 'XRP'], ada: ['cardano', 'Cardano'], doge: ['dogecoin', 'Dogecoin'], avax: ['avalanche-2', 'Avalanche'],
  dot: ['polkadot', 'Polkadot'], link: ['chainlink', 'Chainlink'], ltc: ['litecoin', 'Litecoin'], trx: ['tron', 'TRON'],
  ton: ['the-open-network', 'Toncoin'], sui: ['sui', 'Sui'], near: ['near', 'NEAR Protocol'], apt: ['aptos', 'Aptos'],
  arb: ['arbitrum', 'Arbitrum'], op: ['optimism', 'Optimism'], hype: ['hyperliquid', 'Hyperliquid'], jup: ['jupiter-exchange-solana', 'Jupiter'],
  bonk: ['bonk', 'Bonk'], wif: ['dogwifcoin', 'dogwifhat'], pepe: ['pepe', 'Pepe'], usdc: ['usd-coin', 'USDC'], usdt: ['tether', 'Tether'],
};

/** Map a ticker or name ("BTC", "bitcoin") to a CoinGecko id, preferring the highest market cap. */
export async function resolveId(query) {
  const q = query.trim().toLowerCase();
  if (KNOWN[q]) return { id: KNOWN[q][0], symbol: q, name: KNOWN[q][1] };
  const known = Object.entries(KNOWN).find(([, [id]]) => id === q);
  if (known) return { id: q, symbol: known[0], name: known[1][1] };
  const coins = await search(q);
  if (!coins.length) return null;
  const exactId = coins.find(c => c.id === q);
  if (exactId) return exactId;
  const bySymbol = coins.filter(c => c.symbol.toLowerCase() === q).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9));
  if (bySymbol.length) return bySymbol[0];
  return coins[0];
}

/** Quotes for several ids in one call. */
export async function quotes(ids) {
  const list = [...new Set(ids)].map(encodeURIComponent).join(',');
  const data = await get(`/simple/price?ids=${list}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true`, 15000);
  const out = {};
  for (const id of ids) {
    const q = data[id];
    if (!q) continue;
    out[id] = {
      price: q.usd,
      change_24h_pct: q.usd_24h_change != null ? round2(q.usd_24h_change) : null,
      volume_24h: q.usd_24h_vol ?? null,
      market_cap: q.usd_market_cap ?? null,
      updated_at: q.last_updated_at ? new Date(q.last_updated_at * 1000).toISOString() : null,
    };
  }
  return out;
}

export async function quote(id) {
  const q = (await quotes([id]))[id];
  if (!q) throw new Error(`CoinGecko has no price for "${id}"`);
  return q;
}

/**
 * CoinGecko's free OHLC endpoint picks the candle size from `days`:
 * 1–2 days → 30 min, 3–30 days → 4 h, 31+ days → 4 days. No volume per candle.
 */
export async function ohlc(id, minutes) {
  let days, actual;
  if (minutes <= 30) { days = 1; actual = '30'; }
  else if (minutes <= 240) { days = 30; actual = '240'; }
  else { days = 365; actual = '4D'; }
  const rows = await get(`/coins/${encodeURIComponent(id)}/ohlc?vs_currency=usd&days=${days}`, 60000);
  const bars = rows.map(([t, o, h, l, c]) => ({ time: Math.floor(t / 1000), open: o, high: h, low: l, close: c, volume: null }));
  return { bars, actual_timeframe: actual, note: 'CoinGecko free OHLC: fixed candle size per range and no per-candle volume.' };
}

export async function global() {
  const { data } = await get('/global', 120000);
  return {
    total_market_cap_usd: data.total_market_cap?.usd,
    total_volume_usd: data.total_volume?.usd,
    market_cap_change_24h_pct: round2(data.market_cap_change_percentage_24h_usd),
    btc_dominance_pct: round2(data.market_cap_percentage?.btc),
    eth_dominance_pct: round2(data.market_cap_percentage?.eth),
  };
}

export async function trending() {
  const data = await get('/search/trending', 300000);
  return (data.coins || []).slice(0, 10).map(({ item }) => ({ id: item.id, symbol: item.symbol, name: item.name, rank: item.market_cap_rank }));
}

function round2(n) { return n == null ? null : Math.round(n * 100) / 100; }
