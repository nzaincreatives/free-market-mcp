/**
 * Symbol parsing, data-source routing and HTTP retry — with a mocked fetch.
 * Run: node --test tests/data.test.js
 */
import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { setFetch, setRateLimitWaits } from '../src/http.js';
import { classify, parseTimeframe, formatTimeframe } from '../src/core/resolve.js';
import { getQuote, getOhlcv, roundPrice } from '../src/core/data.js';
import { simulate } from '../src/core/backtest.js';

const BONK = 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263';

function mockFetch(routes) {
  const calls = [];
  setFetch(async (url) => {
    calls.push(url);
    const route = routes.find(([pattern]) => url.includes(pattern));
    if (!route) return { ok: false, status: 404, json: async () => ({}) };
    const body = typeof route[1] === 'function' ? route[1](url, calls) : route[1];
    if (body && body.__status) return { ok: false, status: body.__status, headers: { get: () => null }, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  });
  return calls;
}

const dexPair = (over = {}) => ({
  chainId: 'solana', dexId: 'raydium', pairAddress: 'POOL1', url: 'https://dexscreener.com/x',
  baseToken: { address: BONK, symbol: 'Bonk', name: 'Bonk' }, quoteToken: { address: 'So1', symbol: 'SOL' },
  priceUsd: '0.000003', priceChange: { h1: 1, h24: -2 }, volume: { h24: 5000 }, liquidity: { usd: 100000 }, marketCap: 1e8, ...over,
});

describe('symbols and timeframes', () => {
  it('classifies coins, prefixed addresses and bare mints', () => {
    assert.deepEqual(classify('BTC'), { kind: 'coin', query: 'BTC' });
    assert.deepEqual(classify(`solana:${BONK}`), { kind: 'dex', chain: 'solana', address: BONK });
    assert.deepEqual(classify(BONK), { kind: 'dex', chain: 'solana', address: BONK });
    assert.equal(classify('0x' + 'a'.repeat(40)).chain, null);
    assert.throws(() => classify(''));
  });

  it('parses TradingView-style and suffixed timeframes', () => {
    assert.equal(parseTimeframe('15'), 15);
    assert.equal(parseTimeframe('4h'), 240);
    assert.equal(parseTimeframe('D'), 1440);
    assert.equal(parseTimeframe('1w'), 10080);
    assert.throws(() => parseTimeframe('abc'));
    assert.equal(formatTimeframe(1440), 'D');
    assert.equal(formatTimeframe(240), '240');
  });

  it('keeps significant digits for micro prices', () => {
    assert.equal(roundPrice(0.0000029973456), 0.00000299735);
    assert.equal(roundPrice(80338.123), 80338.12);
  });
});

describe('data routing', () => {
  beforeEach(() => { delete process.env.BIRDEYE_API_KEY; setRateLimitWaits([1, 1]); });

  it('quotes a known coin via CoinGecko without a search call', async () => {
    const calls = mockFetch([['/simple/price', { bitcoin: { usd: 80000, usd_24h_change: -1.234, usd_24h_vol: 5, usd_market_cap: 9 } }]]);
    const q = await getQuote({ symbol: 'BTC' });
    assert.equal(q.price, 80000);
    assert.equal(q.change_24h_pct, -1.23);
    assert.equal(calls.length, 1);
  });

  it('picks the most traded DEX pair, not the one with fake liquidity', async () => {
    mockFetch([['/token-pairs/v1/solana/', [
      dexPair({ pairAddress: 'FAKE', liquidity: { usd: 9e9 }, volume: { h24: 1 } }),
      dexPair({ pairAddress: 'REAL', liquidity: { usd: 1e5 }, volume: { h24: 1e6 } }),
    ]]]);
    const q = await getQuote({ symbol: BONK });
    assert.equal(q.source, 'dexscreener');
    assert.match(q.url, /dexscreener/);
    assert.equal(q.liquidity_usd, 1e5);
  });

  it('loads DEX candles from GeckoTerminal sorted oldest first', async () => {
    const calls = mockFetch([
      ['/token-pairs/v1/solana/', [dexPair()]],
      ['/ohlcv/minute', { data: { attributes: { ohlcv_list: [[300, 1, 2, 0.5, 1.5, 10], [0, 1, 2, 0.5, 1.2, 10]] } } }],
    ]);
    const r = await getOhlcv({ symbol: `solana:${BONK}`, timeframe: '15', count: 2 });
    assert.equal(r.source, 'geckoterminal');
    assert.deepEqual(r.bars.map(b => b.time), [0, 300]);
    assert.ok(calls.some(u => u.includes('aggregate=15')));
  });

  it('uses Birdeye for DEX tokens when BIRDEYE_API_KEY is set', async () => {
    process.env.BIRDEYE_API_KEY = 'test';
    mockFetch([
      ['/token-pairs/v1/solana/', [dexPair()]],
      ['public-api.birdeye.so', { success: true, data: { items: [{ unixTime: 1, o: 1, h: 2, l: 0.5, c: 1.5, v: 3 }] } }],
    ]);
    const r = await getOhlcv({ symbol: BONK, timeframe: '60', summary: true });
    assert.equal(r.source, 'birdeye');
    assert.equal(r.avg_volume, 3);
  });

  it('reports CoinGecko candle limits for coins', async () => {
    mockFetch([['/coins/bitcoin/ohlc', [[1000, 1, 2, 0.5, 1.5], [2000, 1.5, 2, 1, 1.8]]]]);
    const r = await getOhlcv({ symbol: 'bitcoin', timeframe: '60', summary: true });
    assert.equal(r.timeframe, '240');
    assert.equal(r.requested_timeframe, '60');
    assert.equal(r.avg_volume, null);
  });

  it('retries after a 429 and then succeeds', async () => {
    let n = 0;
    mockFetch([['/simple/price', () => (++n === 1 ? { __status: 429 } : { ethereum: { usd: 2000 } })]]);
    const q = await getQuote({ symbol: 'ETH' });
    assert.equal(q.price, 2000);
    assert.equal(n, 2);
  });
});

describe('backtest simulation', () => {
  const bars = [10, 10, 12, 12, 9, 9].map((c, i) => ({ time: i * 60, open: c, high: c, low: c, close: c, volume: 1 }));

  it('computes returns, win rate and drawdown without fees', () => {
    const sig = [1, 0, -1, 1, -1, 0];
    const r = simulate(bars, sig, { feePct: 0 });
    assert.equal(r.trades_count, 2);
    assert.equal(r.trades[0].return_pct, 20);
    assert.equal(r.trades[1].return_pct, -25);
    assert.equal(r.win_rate_pct, 50);
    assert.equal(r.total_return_pct, -10);
    assert.equal(r.max_drawdown_pct, 25);
  });

  it('exits on stop loss', () => {
    const r = simulate(bars, [0, 0, 0, 1, 0, 0], { feePct: 0, stopLossPct: 10 });
    assert.equal(r.trades[0].reason, 'stop_loss');
    assert.equal(r.trades[0].return_pct, -10);
  });
});
