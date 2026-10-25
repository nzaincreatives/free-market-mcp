/**
 * Named local watchlists. Default list is "main".
 */
import { load, save } from './store.js';
import { resolve } from './resolve.js';
import * as coingecko from '../sources/coingecko.js';

const lists = () => load('watchlists', { main: [] });

export function list() {
  return { success: true, watchlists: lists() };
}

export function add({ symbols, name = 'main' }) {
  const all = lists();
  const cur = all[name] || [];
  const added = symbols.filter(s => !cur.includes(s));
  all[name] = [...cur, ...added];
  save('watchlists', all);
  return { success: true, name, added, symbols: all[name] };
}

export function remove({ symbols, name = 'main' }) {
  const all = lists();
  if (!all[name]) throw new Error(`Watchlist "${name}" does not exist`);
  all[name] = all[name].filter(s => !symbols.includes(s));
  if (!all[name].length && name !== 'main') delete all[name];
  save('watchlists', all);
  return { success: true, name, removed: symbols, symbols: all[name] || [] };
}

/**
 * Quotes for every symbol on a list; failures are reported per symbol.
 * Coins share one CoinGecko call so a long list doesn't hit the rate limit.
 */
export async function quotes({ name = 'main' }) {
  const symbols = lists()[name];
  if (!symbols) throw new Error(`Watchlist "${name}" does not exist`);
  const resolved = await Promise.all(symbols.map(s => resolve(s).catch(err => ({ error: err.message }))));
  const ids = resolved.filter(r => r.kind === 'coin').map(r => r.id);
  let coinQuotes = {}, coinError = null;
  if (ids.length) {
    try { coinQuotes = await coingecko.quotes(ids); } catch (err) { coinError = err.message; }
  }
  const rows = symbols.map((symbol, i) => {
    const r = resolved[i];
    if (r.error) return { symbol, error: r.error };
    if (r.kind === 'dex') {
      const p = r.pair;
      return { symbol, name: r.symbol, price: p.price, change_24h_pct: p.change_24h_pct, volume_24h: p.volume_24h, source: 'dexscreener' };
    }
    const q = coinQuotes[r.id];
    if (!q) return { symbol, error: coinError || `CoinGecko has no price for "${r.id}"` };
    return { symbol, price: q.price, change_24h_pct: q.change_24h_pct, volume_24h: q.volume_24h, source: 'coingecko' };
  });
  return { success: true, name, quotes: rows };
}
