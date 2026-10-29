// Read-only MEXC public market data (no API key, no account, no orders).
import { z } from 'zod';
import { getJson } from '../src/http.js';

const SPOT = 'https://api.mexc.com/api/v3';
const FUT = 'https://contract.mexc.com/api/v1/contract';
const TTL = 15000;
const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
const round = (v, d = 6) => (v === null || !Number.isFinite(v) ? null : Number(v.toFixed(d)));

export function baseCoin(input) {
  return String(input).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/USDT$/, '');
}

const SPOT_INTERVALS = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '60m': '60m', '1h': '60m', '4h': '4h', '1d': '1d', '1w': '1W' };
const FUT_INTERVALS = { '1m': ['Min1', 60], '5m': ['Min5', 300], '15m': ['Min15', 900], '30m': ['Min30', 1800], '60m': ['Min60', 3600], '1h': ['Min60', 3600], '4h': ['Hour4', 14400], '1d': ['Day1', 86400], '1w': ['Week1', 604800] };

function bookStats(depth, levels = 20) {
  const side = (rows) => (rows || []).slice(0, levels).reduce((s, [p, q]) => s + Number(p) * Number(q), 0);
  const bid = side(depth?.bids);
  const ask = side(depth?.asks);
  const total = bid + ask;
  return { levels, bid_notional_usdt: round(bid, 0), ask_notional_usdt: round(ask, 0), bid_share_pct: total ? round((bid / total) * 100, 1) : null };
}

async function safe(fn) {
  try { return await fn(); } catch (err) { return { error: err.message }; }
}

async function market({ symbol }) {
  const coin = baseCoin(symbol);
  const spotSym = `${coin}USDT`;
  const futSym = `${coin}_USDT`;
  const [spot, futures] = await Promise.all([
    safe(async () => {
      const [t, d] = await Promise.all([
        getJson(`${SPOT}/ticker/24hr?symbol=${spotSym}`, { ttlMs: TTL }),
        getJson(`${SPOT}/depth?symbol=${spotSym}&limit=20`, { ttlMs: TTL }),
      ]);
      return {
        symbol: spotSym, price: num(t.lastPrice), change_24h_pct: round(num(t.priceChangePercent) * 100, 2),
        high_24h: num(t.highPrice), low_24h: num(t.lowPrice), volume_24h_usdt: round(num(t.quoteVolume), 0),
        bid: num(t.bidPrice), ask: num(t.askPrice), orderbook: bookStats(d),
      };
    }),
    safe(async () => {
      const [t, f, detail, d] = await Promise.all([
        getJson(`${FUT}/ticker?symbol=${futSym}`, { ttlMs: TTL }),
        getJson(`${FUT}/funding_rate/${futSym}`, { ttlMs: TTL }),
        getJson(`${FUT}/detail?symbol=${futSym}`, { ttlMs: 600000 }),
        getJson(`${FUT}/depth/${futSym}?limit=20`, { ttlMs: TTL }),
      ]);
      const tk = t.data; const fr = f.data; const dt = detail.data;
      if (!tk) throw new Error(`no futures ticker for ${futSym}`);
      let contractSize = num(Array.isArray(dt) ? dt[0]?.contractSize : dt?.contractSize);
      let contractSizeSource = 'exchange contract detail';
      const vol24 = num(tk.volume24);
      const amt24 = num(tk.amount24);
      if (!contractSize && vol24 && amt24 && num(tk.lastPrice)) {
        // Fallback: 24h USDT turnover / (24h contracts x price) gives the coins per contract; round to 1 significant digit.
        contractSize = Number((amt24 / (vol24 * num(tk.lastPrice))).toPrecision(1));
        contractSizeSource = 'derived from 24h volume (estimate)';
      }
      const oiContracts = num(tk.holdVol);
      const cycle = num(fr?.collectCycle);
      const fundingPct = round(num(fr?.fundingRate ?? tk.fundingRate) * 100, 5);
      return {
        symbol: futSym, last: num(tk.lastPrice), index_price: num(tk.indexPrice), fair_price: num(tk.fairPrice),
        change_24h_pct: round(num(tk.riseFallRate) * 100, 2), volume_24h_usd: round(num(tk.amount24), 0),
        funding_rate_pct: fundingPct, funding_cycle_hours: cycle,
        funding_rate_pct_per_8h: fundingPct !== null && cycle ? round((fundingPct * 8) / cycle, 5) : null,
        next_funding_settle: fr?.nextSettleTime ? new Date(fr.nextSettleTime).toISOString() : null,
        open_interest_contracts: oiContracts, contract_size: contractSize, contract_size_source: contractSize ? contractSizeSource : null, volume_24h_contracts: vol24,
        open_interest_usd: contractSize && oiContracts ? round(oiContracts * contractSize * num(tk.lastPrice), 0) : null,
        orderbook: bookStats(d.data && contractSize ? { bids: d.data.bids?.map(([p, q]) => [p, q * (contractSize || 1)]), asks: d.data.asks?.map(([p, q]) => [p, q * (contractSize || 1)]) } : null),
        timestamp: tk.timestamp ? new Date(tk.timestamp).toISOString() : null,
      };
    }),
  ]);
  const basis = spot.price && futures.last ? round(((futures.last - spot.price) / spot.price) * 100, 3) : null;
  return { success: true, source: 'mexc public api', note: 'Read-only market data. Funding rate is per settlement cycle (funding_rate_pct_per_8h normalizes it; some coins settle every 4h). Open interest is an estimate: contracts x contract size x last price.', coin, spot, futures, basis_futures_vs_spot_pct: basis, fetched_at: new Date().toISOString() };
}

async function candles({ symbol, market: mk = 'futures', interval = '60m', limit = 100 }) {
  const coin = baseCoin(symbol);
  const n = Math.min(Math.max(Number(limit) || 100, 5), 500);
  const iv = String(interval).toLowerCase();
  let rows;
  if (mk === 'spot') {
    const code = SPOT_INTERVALS[iv];
    if (!code) throw new Error(`interval must be one of ${Object.keys(SPOT_INTERVALS).join(', ')}`);
    const raw = await getJson(`${SPOT}/klines?symbol=${coin}USDT&interval=${code}&limit=${n}`, { ttlMs: TTL });
    rows = raw.map((k) => [Number(k[0]), num(k[1]), num(k[2]), num(k[3]), num(k[4]), num(k[5])]);
  } else {
    const spec = FUT_INTERVALS[iv];
    if (!spec) throw new Error(`interval must be one of ${Object.keys(FUT_INTERVALS).join(', ')}`);
    const end = Math.floor(Date.now() / 1000);
    const start = end - spec[1] * n;
    const raw = await getJson(`${FUT}/kline/${coin}_USDT?interval=${spec[0]}&start=${start}&end=${end}`, { ttlMs: TTL });
    const k = raw.data;
    if (!k?.time) throw new Error(`no futures candles for ${coin}_USDT`);
    rows = k.time.map((t, i) => [t * 1000, num(k.open[i]), num(k.high[i]), num(k.low[i]), num(k.close[i]), num(k.vol[i])]);
  }
  rows = rows.slice(-n);
  const highs = rows.map((r) => r[2]); const lows = rows.map((r) => r[3]);
  const first = rows[0]; const last = rows[rows.length - 1];
  return {
    success: true, source: 'mexc public api', market: mk === 'spot' ? 'spot' : 'futures', symbol: mk === 'spot' ? `${coin}USDT` : `${coin}_USDT`, interval: iv,
    columns: ['time_ms', 'open', 'high', 'low', 'close', 'volume'],
    summary: { bars: rows.length, from: new Date(first[0]).toISOString(), to: new Date(last[0]).toISOString(), high: Math.max(...highs), low: Math.min(...lows), change_pct: round(((last[4] - first[1]) / first[1]) * 100, 2) },
    candles: rows,
  };
}

async function fundingHistory({ symbol, limit = 24 }) {
  const coin = baseCoin(symbol);
  const size = Math.min(Math.max(Number(limit) || 24, 1), 100);
  const raw = await getJson(`${FUT}/funding_rate/history?symbol=${coin}_USDT&page_num=1&page_size=${size}`, { ttlMs: 60000 });
  const list = raw.data?.resultList || [];
  const items = list.map((r) => ({ time: new Date(r.settleTime).toISOString(), funding_rate_pct: round(num(r.fundingRate) * 100, 5), cycle_hours: num(r.collectCycle) }));
  const avg = items.length ? round(items.reduce((s, r) => s + r.funding_rate_pct, 0) / items.length, 5) : null;
  return { success: true, source: 'mexc public api', symbol: `${coin}_USDT`, count: items.length, average_funding_rate_pct: avg, history: items };
}

const sym = z.string().describe('Coin ticker, e.g. "BTC", "ETH", "SOL", "ONDO", "XRP" (USDT pairs)');

export const MEXC_TOOLS = [
  { name: 'mexc_market', description: 'MEXC live market snapshot for one coin (read-only, public): spot price and 24h stats, futures last/index price, funding rate, open interest (est. USD), futures-vs-spot basis, order book bid/ask balance (top 20 levels).', schema: { symbol: sym }, handler: market },
  { name: 'mexc_candles', description: 'MEXC candles (OHLCV) for spot or perpetual futures. Intervals 1m, 5m, 15m, 30m, 1h, 4h, 1d, 1w. Returns a summary plus compact rows [time_ms, open, high, low, close, volume]. Futures volume is in contracts (not coins); spot volume is in base-coin units.', schema: { symbol: sym, market: z.enum(['spot', 'futures']).optional().describe('Default futures'), interval: z.string().optional().describe('Default 1h'), limit: z.coerce.number().optional().describe('Bars, 5-500, default 100') }, handler: candles },
  { name: 'mexc_funding_history', description: 'MEXC perpetual funding rate history (most recent settlements first) with the average over the window.', schema: { symbol: sym, limit: z.coerce.number().optional().describe('Settlements, 1-100, default 24') }, handler: fundingHistory },
];
