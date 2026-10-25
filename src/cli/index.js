#!/usr/bin/env node

/**
 * fm — CLI for every Free Market MCP tool.
 * Usage: fm <tool> [key=value ...]   e.g.  fm quote_get symbol=BTC
 *        fm data_get_ohlcv symbol=solana timeframe=240 summary=true
 *        fm batch_run symbols=BTC,ETH action=quote
 * Lists use commas; objects use JSON (params='{"fast":12}').
 * Outputs JSON to stdout. Errors to stderr. Exit codes: 0 success, 1 error.
 */
import { z } from 'zod';
import { TOOLS } from '../tools/index.js';

function help() {
  const lines = ['Usage: fm <tool> [key=value ...]', '', 'Tools:'];
  for (const t of TOOLS) lines.push(`  ${t.name.padEnd(18)} ${t.description.split('. ')[0]}`);
  lines.push('', 'Run "fm <tool> --help" for its arguments.');
  return lines.join('\n');
}

function toolHelp(t) {
  const lines = [`fm ${t.name}`, '', t.description, '', 'Arguments:'];
  for (const [k, s] of Object.entries(t.schema)) lines.push(`  ${k}${s.isOptional() ? '' : ' (required)'}  ${s.description || ''}`);
  if (!Object.keys(t.schema).length) lines.push('  (none)');
  return lines.join('\n');
}

function unwrap(s) {
  while (s instanceof z.ZodOptional || s instanceof z.ZodDefault) s = s._def.innerType;
  return s;
}

function parseArgs(tool, argv) {
  const out = {};
  for (const arg of argv) {
    const i = arg.indexOf('=');
    if (i < 1) throw new Error(`Expected key=value, got "${arg}"`);
    const key = arg.slice(0, i), raw = arg.slice(i + 1);
    const s = tool.schema[key];
    if (!s) throw new Error(`Unknown argument "${key}" for ${tool.name}. Known: ${Object.keys(tool.schema).join(', ') || 'none'}`);
    const base = unwrap(s);
    if (base instanceof z.ZodArray) out[key] = raw.split(',').map(x => x.trim()).filter(Boolean);
    else if (base instanceof z.ZodRecord || base instanceof z.ZodObject) out[key] = JSON.parse(raw);
    else if (base instanceof z.ZodBoolean) out[key] = raw === 'true' || raw === '1';
    else out[key] = raw;
  }
  return z.object(tool.schema).parse(out);
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (!name || name === '--help' || name === '-h' || name === 'help') { console.log(help()); return 0; }
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) { console.error(`Unknown tool "${name}".\n\n${help()}`); return 1; }
  if (rest.includes('--help')) { console.log(toolHelp(tool)); return 0; }
  try {
    const result = await tool.handler(parseArgs(tool, rest));
    console.log(JSON.stringify(result, null, 2));
    return result.success === false ? 1 : 0;
  } catch (err) {
    const msg = err instanceof z.ZodError ? err.issues.map(i => `${i.path.join('.') || 'args'}: ${i.message}`).join('; ') : err.message;
    console.error(JSON.stringify({ success: false, error: msg }));
    return 1;
  }
}

process.exitCode = await main();
