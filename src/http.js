/**
 * Shared HTTP helper for all data sources.
 * Adds a timeout, a retry with backoff on 429/5xx, and a small in-memory cache
 * so repeated calls inside one analysis don't burn free-tier rate limits.
 */

const DEFAULT_TIMEOUT_MS = 15000;
const MAX_RETRIES = 2;
let RATE_LIMIT_WAITS_MS = [5000, 15000];
const cache = new Map();

// Tests swap these out to avoid real network calls and long waits.
let _fetch = (...args) => fetch(...args);
export function setFetch(fn) { _fetch = fn; cache.clear(); }
export function setRateLimitWaits(ms) { RATE_LIMIT_WAITS_MS = ms; }
export function clearCache() { cache.clear(); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function getJson(url, { headers = {}, ttlMs = 30000, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const key = url + JSON.stringify(headers);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value;

  let lastErr;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await _fetch(url, { headers: { accept: 'application/json', ...headers }, signal: ctrl.signal });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${new URL(url).host} answered HTTP ${res.status}${res.status === 429 ? ' (rate limit — free tier, try again in a minute)' : ''}`);
        if (attempt < MAX_RETRIES) {
          // Free tiers reset per minute, so 429 needs a longer pause than a 5xx blip.
          const retryAfter = Number(res.headers?.get?.('retry-after'));
          const wait = res.status === 429 ? (retryAfter > 0 && retryAfter <= 60 ? retryAfter * 1000 : RATE_LIMIT_WAITS_MS[attempt]) : 1000 * 2 ** attempt;
          await sleep(wait);
          continue;
        }
        throw lastErr;
      }
      if (!res.ok) throw new Error(`${new URL(url).host} answered HTTP ${res.status}`);
      const value = await res.json();
      if (ttlMs > 0) cache.set(key, { value, expires: Date.now() + ttlMs });
      return value;
    } catch (err) {
      lastErr = err.name === 'AbortError' ? new Error(`${new URL(url).host} timed out after ${timeoutMs}ms`) : err;
      if (attempt >= MAX_RETRIES || !/timed out|fetch failed/.test(lastErr.message)) throw lastErr;
      await sleep(1000 * 2 ** attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
