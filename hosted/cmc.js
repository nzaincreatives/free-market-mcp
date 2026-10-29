// Read-only CoinMarketCap data (needs CMC_API_KEY in the server environment). No trading, no account actions.
import { z } from 'zod';
import { getJson } from '../src/http.js';

const BASE = 'https://pro-api.coinmarketcap.com';
const TTL = 60000;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round = (v, d = 4) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));
const DEFAULT_SYMBOLS = 'BTC,ETH,SOL,ONDO,XRP';

function headers() {
  const key = process.env.CMC_API_KEY;
  if (!key) throw new Error('CMC_API_KEY is not set on the server (add it in the Vercel project environment and redeploy)');
  return { 'X-CMC_PRO_API_KEY': key };
}

async function cmcGet(path) {
  const res = await getJson(`${BASE}${path}`, { headers: headers(), ttlMs: TTL });
  const status = res?.status;
  if (status && status.error_code) throw new Error(`CoinMarketCap error ${status.error_code}: ${status.error_message}`);
  return res;
}

function pickEntry(entry) {
  // v2 returns an array per symbol (several coins can share a ticker): take the best-ranked one.
  const list = Array.isArray(entry) ? entry : [entry];
  const ranked = list.filter(Boolean).sort((a, b) => (a.cmc_rank ?? 1e9) - (b.cmc_rank ?? 1e9));
  return { coin: ranked[0], candidates: list.length };
}

async function quotes({ symbols = DEFAULT_SYMBOLS }) {
  const clean = String(symbols).toUpperCase().replace(/[^A-Z0-9,]/g, '').split(',').filter(Boolean).slice(0, 20).join(',');
  if (!clean) throw new Error('no symbols given');
  const res = await cmcGet(`/v2/cryptocurrency/quotes/latest?symbol=${clean}&convert=USD`);
  const out = {};
  for (const sym of clean.split(',')) {
    const raw = res.data?.[sym];
    if (!raw) { out[sym] = { error: 'not found on CoinMarketCap' }; continue; }
    const { coin, candidates } = pickEntry(raw);
    const q = coin.quote?.USD || {};
    out[sym] = {
      name: coin.name, slug: coin.slug, cmc_id: coin.id, cmc_rank: coin.cmc_rank, same_ticker_candidates: candidates,
      price_usd: round(num(q.price), 6),
      change_1h_pct: round(num(q.percent_change_1h), 2), change_24h_pct: round(num(q.percent_change_24h), 2),
      change_7d_pct: round(num(q.percent_change_7d), 2), change_30d_pct: round(num(q.percent_change_30d), 2), change_90d_pct: round(num(q.percent_change_90d), 2),
      volume_24h_usd: round(num(q.volume_24h), 0), volume_change_24h_pct: round(num(q.volume_change_24h), 2),
      market_cap_usd: round(num(q.market_cap), 0), fully_diluted_market_cap_usd: round(num(q.fully_diluted_market_cap), 0),
      market_cap_dominance_pct: round(num(q.market_cap_dominance), 3),
      circulating_supply: num(coin.circulating_supply), total_supply: num(coin.total_supply), max_supply: num(coin.max_supply),
      circulating_share_of_max_pct: coin.max_supply ? round((num(coin.circulating_supply) / num(coin.max_supply)) * 100, 1) : null,
      last_updated: q.last_updated || coin.last_updated || null,
    };
  }
  return { success: true, source: 'coinmarketcap', note: 'Aggregated prices across exchanges. Compare with CoinGecko and exchange prices; small differences are normal.', quotes: out, fetched_at: new Date().toISOString() };
}

async function safe(fn) {
  try { return await fn(); } catch (err) { return { error: err.message }; }
}

async function globalMetrics() {
  const [g, fg] = await Promise.all([
    safe(async () => {
      const res = await cmcGet('/v1/global-metrics/quotes/latest?convert=USD');
      const d = res.data || {}; const q = d.quote?.USD || {};
      return {
        btc_dominance_pct: round(num(d.btc_dominance), 2), eth_dominance_pct: round(num(d.eth_dominance), 2),
        total_market_cap_usd: round(num(q.total_market_cap), 0), total_volume_24h_usd: round(num(q.total_volume_24h), 0),
        market_cap_change_24h_pct: round(num(q.total_market_cap_yesterday_percentage_change), 2),
        altcoin_market_cap_usd: round(num(q.altcoin_market_cap), 0), stablecoin_market_cap_usd: round(num(q.stablecoin_market_cap), 0),
        defi_market_cap_usd: round(num(q.defi_market_cap), 0), derivatives_volume_24h_usd: round(num(q.derivatives_volume_24h), 0),
        active_cryptocurrencies: num(d.active_cryptocurrencies), last_updated: d.last_updated || q.last_updated || null,
      };
    }),
    safe(async () => {
      const res = await cmcGet('/v3/fear-and-greed/latest');
      const d = res.data || {};
      return { value: num(d.value), classification: d.value_classification ?? null, updated: d.update_time ?? null };
    }),
  ]);
  return { success: true, source: 'coinmarketcap', global: g, fear_and_greed: fg, note: 'fear_and_greed may be unavailable on some CoinMarketCap plans; an error entry then explains why.', fetched_at: new Date().toISOString() };
}

export const CMC_TOOLS = [
  { name: 'cmc_quotes', description: 'CoinMarketCap quotes (read-only): price, 1h/24h/7d/30d/90d change, volume, market cap, FDV, supply, rank. Default coins BTC,ETH,SOL,ONDO,XRP in ONE call (saves API credits). Needs CMC_API_KEY on the server.', schema: { symbols: z.string().optional().describe('Comma-separated tickers, default "BTC,ETH,SOL,ONDO,XRP" (max 20)') }, handler: quotes },
  { name: 'cmc_global', description: 'CoinMarketCap global market metrics (read-only): total market cap and volume, BTC/ETH dominance, altcoin/stablecoin/DeFi market cap, derivatives volume, plus the CMC Fear & Greed index if the plan allows it. Needs CMC_API_KEY on the server.', schema: {}, handler: globalMetrics },
];
