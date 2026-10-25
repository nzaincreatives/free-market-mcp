/**
 * CLI and MCP server wiring — no network needed.
 * Run: node --test tests/cli.test.js
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'child_process';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { TOOLS } from '../src/tools/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, '..', 'src', 'cli', 'index.js');
const SERVER = join(__dirname, '..', 'src', 'server.js');
const HOME = mkdtempSync(join(tmpdir(), 'fm-test-'));

function run(args) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf-8', timeout: 15000, env: { ...process.env, FREE_MARKET_MCP_HOME: HOME } });
    return { stdout, exitCode: 0 };
  } catch (err) {
    return { stdout: err.stdout || '', stderr: err.stderr || '', exitCode: err.status };
  }
}

describe('CLI', () => {
  it('--help lists every tool', () => {
    const { stdout, exitCode } = run(['--help']);
    assert.equal(exitCode, 0);
    for (const t of TOOLS) assert.ok(stdout.includes(t.name), `missing ${t.name}`);
  });

  it('unknown tool exits 1', () => {
    assert.equal(run(['nope']).exitCode, 1);
  });

  it('rejects unknown and missing arguments', () => {
    assert.match(run(['quote_get', 'foo=1']).stderr, /Unknown argument/);
    assert.match(run(['quote_get']).stderr, /symbol/);
  });

  it('manages a local watchlist end to end', () => {
    const add = JSON.parse(run(['watchlist_add', 'symbols=BTC,ETH', 'name=test']).stdout);
    assert.deepEqual(add.symbols, ['BTC', 'ETH']);
    const rm = JSON.parse(run(['watchlist_remove', 'symbols=BTC', 'name=test']).stdout);
    assert.deepEqual(rm.symbols, ['ETH']);
  });

  it('creates, lists and deletes alerts', () => {
    const { alert } = JSON.parse(run(['alert_create', 'symbol=BTC', 'condition=price_above', 'value=100000']).stdout);
    assert.equal(alert.value, 100000);
    assert.ok(JSON.parse(run(['alert_list']).stdout).alerts.some(a => a.id === alert.id));
    assert.equal(JSON.parse(run(['alert_delete', `id=${alert.id}`]).stdout).removed, 1);
    assert.equal(run(['alert_create', 'symbol=BTC', 'condition=bogus', 'value=1']).exitCode, 1);
  });
});

describe('MCP server', () => {
  it('answers initialize and lists all tools over stdio', async () => {
    const proc = spawn('node', [SERVER], { stdio: ['pipe', 'pipe', 'inherit'] });
    let buf = '';
    const responses = new Map();
    proc.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 1);
        if (line.trim()) { const msg = JSON.parse(line); responses.set(msg.id, msg); }
      }
    });
    const send = (msg) => proc.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...msg }) + '\n');
    const waitFor = async (id) => { for (let t = 0; t < 100 && !responses.has(id); t++) await new Promise(r => setTimeout(r, 50)); return responses.get(id); };

    send({ id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } } });
    const init = await waitFor(1);
    assert.equal(init.result.serverInfo.name, 'free-market');
    send({ method: 'notifications/initialized' });
    send({ id: 2, method: 'tools/list' });
    const list = await waitFor(2);
    proc.kill();
    assert.equal(list.result.tools.length, TOOLS.length);
    assert.ok(list.result.tools.some(t => t.name === 'chart_analyze'));
  });
});
