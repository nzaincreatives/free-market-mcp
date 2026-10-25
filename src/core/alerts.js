/**
 * Local price/indicator alerts. There is no background process: alert_check
 * evaluates all active alerts on demand (run it manually or from a scheduled task).
 */
import { randomUUID } from 'crypto';
import { load, save } from './store.js';
import { getQuote } from './data.js';
import { getIndicators } from './indicators.js';

const CONDITIONS = ['price_above', 'price_below', 'rsi_above', 'rsi_below', 'change_24h_above', 'change_24h_below'];

export function create({ symbol, condition, value, timeframe, note }) {
  if (!CONDITIONS.includes(condition)) throw new Error(`condition must be one of: ${CONDITIONS.join(', ')}`);
  const alerts = load('alerts', []);
  const alert = { id: randomUUID().slice(0, 8), symbol, condition, value, ...(timeframe && { timeframe }), ...(note && { note }), active: true, created_at: new Date().toISOString() };
  alerts.push(alert);
  save('alerts', alerts);
  return { success: true, alert };
}

export function list() {
  return { success: true, alerts: load('alerts', []) };
}

export function remove({ id, all }) {
  const alerts = load('alerts', []);
  const keep = all ? [] : alerts.filter(a => a.id !== id);
  if (!all && keep.length === alerts.length) throw new Error(`No alert with id "${id}"`);
  save('alerts', keep);
  return { success: true, removed: alerts.length - keep.length };
}

export async function check({ deactivate_triggered = true } = {}) {
  const alerts = load('alerts', []);
  const results = [];
  for (const a of alerts.filter(x => x.active)) {
    try {
      let actual;
      if (a.condition.startsWith('rsi_')) {
        const ind = await getIndicators({ symbol: a.symbol, timeframe: a.timeframe || '60', indicators: ['rsi'], count: 200 });
        actual = ind.indicators.rsi?.value;
      } else {
        const q = await getQuote({ symbol: a.symbol });
        actual = a.condition.startsWith('price_') ? q.price : q.change_24h_pct;
      }
      const triggered = actual != null && (a.condition.endsWith('_above') ? actual > a.value : actual < a.value);
      if (triggered && deactivate_triggered) { a.active = false; a.triggered_at = new Date().toISOString(); }
      results.push({ id: a.id, symbol: a.symbol, condition: a.condition, value: a.value, actual, triggered });
    } catch (err) {
      results.push({ id: a.id, symbol: a.symbol, error: err.message });
    }
  }
  save('alerts', alerts);
  return { success: true, checked: results.length, triggered: results.filter(r => r.triggered), results };
}
