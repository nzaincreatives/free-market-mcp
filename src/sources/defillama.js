/**
 * DefiLlama — free, no key. TVL for protocols and chains.
 */
import { getJson } from '../http.js';

const BASE = 'https://api.llama.fi';

const pct = (n) => (n == null ? null : Math.round(n * 100) / 100);

export async function protocols() {
  return getJson(`${BASE}/protocols`, { ttlMs: 600000, timeoutMs: 30000 });
}

export async function protocol(query) {
  const q = query.trim().toLowerCase();
  const list = await protocols();
  const p = list.find(x => x.slug === q) || list.find(x => x.name.toLowerCase() === q) || list.find(x => x.symbol?.toLowerCase() === q);
  // Umbrella names ("jupiter", "aave") are parent protocols: sum their children.
  const children = p ? [] : list.filter(x => x.parentProtocol === `parent#${q}`);
  if (children.length) {
    const tvl = children.reduce((a, c) => a + (c.tvl || 0), 0);
    const weighted = (k) => tvl ? children.reduce((a, c) => a + (c.tvl || 0) * (c[k] || 0), 0) / tvl : null;
    return {
      name: q, slug: q, category: 'parent protocol', chains: [...new Set(children.flatMap(c => c.chains || []))],
      tvl_usd: tvl, change_1d_pct: pct(weighted('change_1d')), change_7d_pct: pct(weighted('change_7d')),
      parts: children.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).map(c => ({ name: c.name, slug: c.slug, category: c.category, tvl_usd: c.tvl })),
    };
  }
  if (!p) {
    const close = list.filter(x => x.name.toLowerCase().includes(q)).slice(0, 5).map(x => x.slug);
    throw new Error(`No DefiLlama protocol "${query}".${close.length ? ' Did you mean: ' + close.join(', ') : ''}`);
  }
  return {
    name: p.name, slug: p.slug, category: p.category, chains: p.chains,
    tvl_usd: p.tvl, change_1d_pct: pct(p.change_1d), change_7d_pct: pct(p.change_7d),
    market_cap: p.mcap ?? null, url: p.url,
  };
}

export async function chains(limit = 15) {
  const list = await getJson(`${BASE}/v2/chains`, { ttlMs: 600000 });
  return list.sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, limit).map(c => ({ name: c.name, tvl_usd: c.tvl, token: c.tokenSymbol }));
}

export async function topProtocols({ chain, category, limit = 15 } = {}) {
  let list = await protocols();
  if (chain) list = list.filter(p => p.chains?.some(c => c.toLowerCase() === chain.toLowerCase()));
  if (category) list = list.filter(p => p.category?.toLowerCase() === category.toLowerCase());
  return list.filter(p => p.category !== 'CEX').sort((a, b) => (b.tvl || 0) - (a.tvl || 0)).slice(0, limit)
    .map(p => ({ name: p.name, slug: p.slug, category: p.category, tvl_usd: p.tvl, change_7d_pct: pct(p.change_7d) }));
}
