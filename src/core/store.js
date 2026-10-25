/**
 * Local JSON storage for watchlists and alerts (replaces TradingView's cloud lists).
 * Lives in ~/.free-market-mcp/ — override with FREE_MARKET_MCP_HOME.
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export const dataDir = () => process.env.FREE_MARKET_MCP_HOME || join(homedir(), '.free-market-mcp');

export function load(name, fallback) {
  try { return JSON.parse(readFileSync(join(dataDir(), `${name}.json`), 'utf-8')); }
  catch { return structuredClone(fallback); }
}

export function save(name, value) {
  mkdirSync(dataDir(), { recursive: true });
  const file = join(dataDir(), `${name}.json`);
  writeFileSync(file + '.tmp', JSON.stringify(value, null, 2));
  renameSync(file + '.tmp', file);
}
