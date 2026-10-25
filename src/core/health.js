/**
 * Check which data sources answer and which optional API keys are set.
 */
import { getJson } from '../http.js';
import { dataDir } from './store.js';

const PROBES = [
  ['coingecko', 'https://api.coingecko.com/api/v3/ping'],
  ['geckoterminal', 'https://api.geckoterminal.com/api/v2/networks?page=1'],
  ['dexscreener', 'https://api.dexscreener.com/latest/dex/search?q=SOL'],
  ['defillama', 'https://api.llama.fi/v2/chains'],
  ['fear_greed', 'https://api.alternative.me/fng/?limit=1'],
];

export async function healthCheck() {
  const sources = {};
  await Promise.all(PROBES.map(async ([name, url]) => {
    const t = Date.now();
    try { await getJson(url, { ttlMs: 0, timeoutMs: 8000 }); sources[name] = { ok: true, ms: Date.now() - t }; }
    catch (err) { sources[name] = { ok: false, error: err.message }; }
  }));
  return {
    success: Object.values(sources).some(s => s.ok),
    sources,
    optional_keys: {
      BIRDEYE_API_KEY: !!process.env.BIRDEYE_API_KEY,
      COINGECKO_API_KEY: !!process.env.COINGECKO_API_KEY,
    },
    data_dir: dataDir(),
  };
}
