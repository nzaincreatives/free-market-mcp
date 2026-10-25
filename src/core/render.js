/**
 * Render a candlestick chart as a standalone SVG file (replaces capture_screenshot).
 * Draws candles, optional EMA/SMA lines, support/resistance levels and a volume strip.
 */
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadBars, roundPrice } from './data.js';
import { ema, sma } from './indicators.js';
import { findLevels } from './analysis.js';
import { dataDir } from './store.js';

const COLORS = { up: '#26a69a', down: '#ef5350', grid: '#2a2e39', text: '#b2b5be', bg: '#131722', lines: ['#f5c542', '#42a5f5', '#ab47bc', '#ff7043'] };

export function renderSvg(bars, { title = '', overlays = [], levels = null, width = 1200, height = 640 } = {}) {
  const pad = { l: 10, r: 80, t: 36, b: 24 };
  const hasVol = bars.some(b => b.volume);
  const volH = hasVol ? 80 : 0;
  const plotH = height - pad.t - pad.b - volH;
  const plotW = width - pad.l - pad.r;
  const hi = Math.max(...bars.map(b => b.high)), lo = Math.min(...bars.map(b => b.low));
  const span = hi - lo || hi * 0.01 || 1;
  const y = (p) => pad.t + (1 - (p - lo) / span) * plotH;
  const step = plotW / bars.length;
  const x = (i) => pad.l + i * step + step / 2;
  const bodyW = Math.max(1, step * 0.65);
  const maxVol = Math.max(...bars.map(b => b.volume || 0)) || 1;

  const parts = [];
  parts.push(`<rect width="${width}" height="${height}" fill="${COLORS.bg}"/>`);
  for (let g = 0; g <= 5; g++) {
    const p = lo + (span * g) / 5;
    parts.push(`<line x1="${pad.l}" x2="${pad.l + plotW}" y1="${y(p)}" y2="${y(p)}" stroke="${COLORS.grid}"/>`);
    parts.push(`<text x="${pad.l + plotW + 6}" y="${y(p) + 4}" fill="${COLORS.text}" font-size="11" font-family="sans-serif">${roundPrice(p)}</text>`);
  }
  if (levels) {
    for (const [kind, color] of [['support', COLORS.up], ['resistance', COLORS.down]]) {
      for (const l of levels[kind]) {
        if (l.price < lo || l.price > hi) continue;
        parts.push(`<line x1="${pad.l}" x2="${pad.l + plotW}" y1="${y(l.price)}" y2="${y(l.price)}" stroke="${color}" stroke-dasharray="6 4" opacity="0.7"/>`);
      }
    }
  }
  bars.forEach((b, i) => {
    const c = b.close >= b.open ? COLORS.up : COLORS.down;
    parts.push(`<line x1="${x(i)}" x2="${x(i)}" y1="${y(b.high)}" y2="${y(b.low)}" stroke="${c}"/>`);
    const top = y(Math.max(b.open, b.close)), h = Math.max(1, Math.abs(y(b.open) - y(b.close)));
    parts.push(`<rect x="${x(i) - bodyW / 2}" y="${top}" width="${bodyW}" height="${h}" fill="${c}"/>`);
    if (hasVol && b.volume) {
      const vh = (b.volume / maxVol) * (volH - 8);
      parts.push(`<rect x="${x(i) - bodyW / 2}" y="${height - pad.b - vh}" width="${bodyW}" height="${vh}" fill="${c}" opacity="0.4"/>`);
    }
  });
  overlays.forEach((o, n) => {
    const pts = o.values.map((v, i) => (v == null ? null : `${x(i)},${y(v)}`)).filter(Boolean).join(' ');
    if (pts) parts.push(`<polyline points="${pts}" fill="none" stroke="${COLORS.lines[n % 4]}" stroke-width="1.5"/>`);
  });
  const legend = overlays.map((o, n) => `<tspan fill="${COLORS.lines[n % 4]}">  ${o.label}</tspan>`).join('');
  parts.push(`<text x="${pad.l + 4}" y="22" fill="${COLORS.text}" font-size="14" font-family="sans-serif">${escapeXml(title)}${legend}</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${parts.join('')}</svg>`;
}

export async function renderChart({ symbol, timeframe, count, overlays = ['ema:20', 'ema:50'], show_levels = true, output_path, source }) {
  // Load extra bars so overlays are warmed up, then draw only the last `count`.
  const want = Math.max(count || 150, 1);
  const r = await loadBars({ symbol, timeframe, count: want + 200, source });
  const shown = Math.min(want, r.bars.length);
  const closes = r.bars.map(b => b.close);
  const lines = overlays.map(spec => {
    const [name, len] = spec.toLowerCase().split(':');
    const n = Number(len) || 20;
    if (name !== 'ema' && name !== 'sma') throw new Error(`overlay "${spec}" not supported (use ema:N or sma:N)`);
    return { label: `${name.toUpperCase()} ${n}`, values: (name === 'ema' ? ema(closes, n) : sma(closes, n)).slice(-shown) };
  });
  const bars = r.bars.slice(-shown);
  const svg = renderSvg(bars, {
    title: `${r.asset.symbol} · ${r.actual_timeframe} · ${r.source}`,
    overlays: lines, levels: show_levels ? findLevels(bars) : null,
  });
  let path = output_path;
  if (!path) {
    const dir = join(dataDir(), 'charts');
    mkdirSync(dir, { recursive: true });
    path = join(dir, `${r.asset.symbol.replace(/[^\w-]/g, '_')}_${r.actual_timeframe}_${new Date().toISOString().replace(/[:.]/g, '-')}.svg`);
  }
  writeFileSync(path, svg);
  return { success: true, symbol: r.asset.symbol, timeframe: r.actual_timeframe, bars: bars.length, file: path, bytes: svg.length };
}

function escapeXml(s) { return String(s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])); }
