/**
 * Symbol and timeframe parsing.
 *
 * Symbols:
 *   "BTC", "bitcoin", "SOL"          → CoinGecko coin (ticker, name or id)
 *   "solana:<mint>", "base:0x…"      → DEX token on that chain
 *   "<solana mint>"                  → DEX token on Solana
 *   "0x…" (40 hex)                   → DEX token, chain looked up via DexScreener
 *
 * Timeframes use TradingView notation: "1", "5", "15", "60", "240", "D", "W"
 * (also accepted: "1m", "4h", "1d", "1w").
 */
import * as coingecko from '../sources/coingecko.js';
import * as dexscreener from '../sources/dexscreener.js';

const SOLANA_ADDRESS = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function parseTimeframe(tf = '60') {
  const s = String(tf).trim().toUpperCase();
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d*)\s*(M|MIN|H|D|W)$/);
  if (!m) throw new Error(`Unknown timeframe "${tf}". Use e.g. 5, 15, 60, 240, D, W.`);
  const n = m[1] ? Number(m[1]) : 1;
  return n * { M: 1, MIN: 1, H: 60, D: 1440, W: 10080 }[m[2]];
}

export function formatTimeframe(minutes) {
  if (minutes % 10080 === 0) return minutes === 10080 ? 'W' : `${minutes / 10080}W`;
  if (minutes % 1440 === 0) return minutes === 1440 ? 'D' : `${minutes / 1440}D`;
  return String(minutes);
}

/** Classify a symbol without network calls. */
export function classify(symbol) {
  const s = String(symbol || '').trim();
  if (!s) throw new Error('symbol is required');
  const prefixed = s.match(/^([a-z0-9_-]+):(.+)$/i);
  if (prefixed && (SOLANA_ADDRESS.test(prefixed[2]) || EVM_ADDRESS.test(prefixed[2]))) {
    return { kind: 'dex', chain: prefixed[1].toLowerCase(), address: prefixed[2] };
  }
  if (EVM_ADDRESS.test(s)) return { kind: 'dex', chain: null, address: s };
  if (SOLANA_ADDRESS.test(s)) return { kind: 'dex', chain: 'solana', address: s };
  return { kind: 'coin', query: s };
}

/** Resolve to a concrete asset: a CoinGecko id or a DEX token with its most liquid pair. */
export async function resolve(symbol) {
  const c = classify(symbol);
  if (c.kind === 'coin') {
    const coin = await coingecko.resolveId(c.query);
    if (!coin) throw new Error(`No coin found for "${c.query}". Try symbol_search, or pass a token address like solana:<mint>.`);
    return { kind: 'coin', id: coin.id, symbol: coin.symbol.toUpperCase(), name: coin.name };
  }
  let pairs;
  if (c.chain) pairs = await dexscreener.tokenPairs(c.chain, c.address);
  else pairs = (await dexscreener.search(c.address)).filter(p => p.base.address?.toLowerCase() === c.address.toLowerCase());
  const pair = pairs[0];
  if (!pair) throw new Error(`No DEX pair found for ${c.chain ? c.chain + ':' : ''}${c.address}`);
  return {
    kind: 'dex', chain: pair.chain, address: pair.base.address,
    symbol: pair.base.symbol, name: pair.base.name, pair,
  };
}
