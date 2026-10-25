/**
 * Indicator math — pure functions, no network.
 * Run: node --test tests/indicators.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sma, ema, rsi, macd, bollinger, atr, stochastic, vwap, compute } from '../src/core/indicators.js';
import { findLevels, trend } from '../src/core/analysis.js';

const bar = (close, i = 0, spread = 1, volume = 100) => ({ time: 1700000000 + i * 3600, open: close, high: close + spread, low: close - spread, close, volume });
const series = (closes) => closes.map((c, i) => bar(c, i));
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe('moving averages', () => {
  it('sma averages the window and is null during warm-up', () => {
    assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
  });

  it('ema is seeded with the sma and equals a constant series', () => {
    const e = ema([5, 5, 5, 5, 5], 3);
    assert.deepEqual(e, [null, null, 5, 5, 5]);
  });

  it('ema reacts with k = 2/(n+1)', () => {
    const e = ema([1, 2, 3, 10], 3);
    near(e[2], 2);
    near(e[3], 10 * 0.5 + 2 * 0.5);
  });
});

describe('oscillators', () => {
  it('rsi is 100 for a series that only rises', () => {
    const r = rsi(Array.from({ length: 30 }, (_, i) => i + 1), 14);
    assert.equal(r[29], 100);
    assert.equal(r[13], null);
    assert.equal(r.length, 30);
  });

  it('rsi is 50 when gains and losses are equal', () => {
    const closes = Array.from({ length: 41 }, (_, i) => (i % 2 ? 11 : 10));
    near(rsi(closes, 14)[40], 50, 5);
  });

  it('macd histogram is zero for a flat series', () => {
    const m = macd(new Array(60).fill(7));
    assert.equal(m.histogram[59], 0);
  });

  it('stochastic %K is 100 at the top of the range', () => {
    const bars = series(Array.from({ length: 20 }, (_, i) => i));
    bars[19].close = bars[19].high;
    assert.equal(stochastic(bars, 14, 1, 1).k[19], 100);
  });
});

describe('volatility and volume', () => {
  it('bollinger bands collapse onto the mean for a flat series', () => {
    const b = bollinger(new Array(25).fill(3), 20, 2);
    assert.equal(b.upper[24], 3);
    assert.equal(b.lower[24], 3);
  });

  it('atr equals the bar range when there are no gaps', () => {
    near(atr(series(new Array(20).fill(10)), 14)[19], 2);
  });

  it('vwap is null without volume', () => {
    assert.equal(vwap([{ ...bar(1), volume: null }])[0], null);
  });
});

describe('compute()', () => {
  it('returns values, states and warnings for unknown specs and short history', () => {
    const bars = series(Array.from({ length: 30 }, (_, i) => 100 + i));
    const { values, warnings } = compute(bars, ['rsi', 'ema:10', 'ema:200', 'nope']);
    assert.equal(values.rsi.state, 'overbought');
    assert.equal(values['ema:10'].price_vs, 'above');
    assert.equal(values['ema:200'], null);
    assert.ok(warnings.some(w => w.includes('nope')));
    assert.ok(warnings.some(w => w.includes('ema:200')));
  });
});

describe('analysis helpers', () => {
  it('finds a resistance level touched twice above price', () => {
    const closes = [10, 11, 12, 15, 12, 11, 10, 11, 12, 15, 12, 11, 10, 11, 12];
    const { resistance } = findLevels(series(closes), { width: 2 });
    assert.ok(resistance.some(l => Math.round(l.price) === 16 && l.touches === 2));
  });

  it('detects an uptrend from stacked EMAs', () => {
    assert.equal(trend(series(Array.from({ length: 80 }, (_, i) => 100 + i))).direction, 'up');
    assert.equal(trend(series([1, 2, 3])).direction, 'unknown');
  });
});
