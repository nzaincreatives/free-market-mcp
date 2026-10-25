/**
 * Market-wide context: search, global stats, trending, sentiment, DeFi TVL.
 */
import * as coingecko from '../sources/coingecko.js';
import * as dexscreener from '../sources/dexscreener.js';
import * as defillama from '../sources/defillama.js';
import { fearGreed } from '../sources/feargreed.js';

export async function symbolSearch({ query, limit = 8 }) {
  const [coins, pairs] = await Promise.allSettled([coingecko.search(query), dexscreener.search(query)]);
  const seen = new Set();
  const dex = (pairs.value || []).filter(p => {
    const k = `${p.chain}:${p.base.address}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return {
    success: true, query,
    coins: (coins.value || []).slice(0, limit).map(c => ({ ...c, use_as: c.id })),
    dex_tokens: dex.slice(0, limit).map(p => ({
      symbol: p.base.symbol, name: p.base.name, chain: p.chain, price: p.price,
      liquidity_usd: p.liquidity_usd, volume_24h: p.volume_24h, use_as: `${p.chain}:${p.base.address}`,
    })),
    ...((coins.status === 'rejected' || pairs.status === 'rejected') && {
      warnings: [coins.reason?.message, pairs.reason?.message].filter(Boolean),
    }),
  };
}

export async function overview() {
  const [g, t, f] = await Promise.allSettled([coingecko.global(), coingecko.trending(), fearGreed(7)]);
  return {
    success: true,
    global: g.value ?? { error: g.reason?.message },
    fear_greed: f.value ? { today: f.value[0], last_7_days: f.value } : { error: f.reason?.message },
    trending: t.value ?? { error: t.reason?.message },
  };
}

export async function defi({ protocol, chain, category, limit }) {
  if (protocol) return { success: true, protocol: await defillama.protocol(protocol) };
  if (chain || category) return { success: true, chain: chain ?? null, category: category ?? null, top_protocols: await defillama.topProtocols({ chain, category, limit }) };
  return { success: true, top_chains: await defillama.chains(limit) };
}
