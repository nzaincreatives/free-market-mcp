/**
 * Run one action across several symbols/timeframes (multi-symbol scan).
 * Runs sequentially with a small delay to stay inside free-tier rate limits.
 */
import { getQuote, getOhlcv } from './data.js';
import { getIndicators } from './indicators.js';
import { analyze } from './analysis.js';

const ACTIONS = {
  quote: ({ symbol }) => getQuote({ symbol }),
  ohlcv_summary: ({ symbol, timeframe, count }) => getOhlcv({ symbol, timeframe, count, summary: true }),
  indicators: ({ symbol, timeframe, indicators }) => getIndicators({ symbol, timeframe, indicators }),
  analyze: ({ symbol, timeframe }) => analyze({ symbol, timeframe }),
};

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

export async function batchRun({ symbols, timeframes, action, indicators, ohlcv_count, delay_ms = 1200 }) {
  const fn = ACTIONS[action];
  if (!fn) throw new Error(`action must be one of: ${Object.keys(ACTIONS).join(', ')}`);
  const tfs = action === 'quote' ? [null] : (timeframes?.length ? timeframes : ['60']);
  const results = [];
  let first = true;
  for (const symbol of symbols) {
    for (const timeframe of tfs) {
      if (!first) await sleep(delay_ms);
      first = false;
      try {
        const { success: _s, ...data } = await fn({ symbol, timeframe, count: ohlcv_count, indicators });
        results.push({ symbol, ...(timeframe && { timeframe }), success: true, data });
      } catch (err) {
        results.push({ symbol, ...(timeframe && { timeframe }), success: false, error: err.message });
      }
    }
  }
  return { success: true, action, total: results.length, failed: results.filter(r => !r.success).length, results };
}
