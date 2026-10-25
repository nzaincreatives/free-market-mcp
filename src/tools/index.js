/**
 * Single tool registry shared by the MCP server and the CLI.
 * Each entry: name, description, zod input shape, handler(args) → result object.
 */
import { z } from 'zod';
import * as data from '../core/data.js';
import { getIndicators, DEFAULT_INDICATORS } from '../core/indicators.js';
import { analyze } from '../core/analysis.js';
import { runBacktest, STRATEGIES } from '../core/backtest.js';
import { batchRun } from '../core/batch.js';
import { renderChart } from '../core/render.js';
import { healthCheck } from '../core/health.js';
import * as market from '../core/market.js';
import * as watchlist from '../core/watchlist.js';
import * as alerts from '../core/alerts.js';

const symbol = z.string().describe('Coin ticker/name/id ("BTC", "solana") or token address ("solana:<mint>", "base:0x…", or a bare Solana mint)');
const timeframe = z.string().optional().describe('Candle size: 1, 5, 15, 60, 240, D, W (also 4h, 1d). Default 60');
const source = z.enum(['auto', 'coingecko', 'geckoterminal', 'birdeye']).optional().describe('Force a data source (default auto)');

export const TOOLS = [
  {
    name: 'health_check',
    description: 'Check which free data sources are reachable and which optional API keys are set. Call first if something fails.',
    schema: {},
    handler: () => healthCheck(),
  },
  {
    name: 'symbol_search',
    description: 'Find coins (CoinGecko) and DEX tokens (DexScreener) by name, ticker or address. Each result has a `use_as` value to pass as `symbol` to other tools.',
    schema: {
      query: z.string().describe('Name, ticker or address, e.g. "bonk", "JUP", "pepe"'),
      limit: z.coerce.number().optional().describe('Max results per group (default 8)'),
    },
    handler: (a) => market.symbolSearch(a),
  },
  {
    name: 'quote_get',
    description: 'Latest price snapshot: price, 24h change, volume, market cap. DEX tokens also return liquidity and 24h buys/sells.',
    schema: { symbol },
    handler: (a) => data.getQuote(a),
  },
  {
    name: 'data_get_ohlcv',
    description: 'Get OHLCV candles. Use summary=true for compact stats instead of all bars (saves context). Coins use CoinGecko (30m/4h/4D candles, no volume); token addresses use GeckoTerminal or Birdeye (any timeframe, with volume).',
    schema: {
      symbol, timeframe, source,
      count: z.coerce.number().optional().describe(`Number of bars (max ${data.MAX_OHLCV_BARS}, default 100)`),
      summary: z.coerce.boolean().optional().describe('Return summary stats (high, low, change %, avg volume, last 5 bars) instead of all bars'),
    },
    handler: (a) => data.getOhlcv(a),
  },
  {
    name: 'indicators_get',
    description: `Compute indicator values locally from candles (replaces reading studies off a chart). Default set: ${DEFAULT_INDICATORS.join(', ')}.`,
    schema: {
      symbol, timeframe, source,
      indicators: z.array(z.string()).optional().describe('Specs like "rsi", "rsi:7", "ema:50", "sma:200", "macd", "macd:8:21:5", "bb", "bb:20:2.5", "atr", "stoch", "vwap"'),
      count: z.coerce.number().optional().describe('Bars to load for warm-up (default 300)'),
    },
    handler: (a) => getIndicators(a),
  },
  {
    name: 'chart_analyze',
    description: 'Full technical read in one call: price, trend, last-100-bar summary, support/resistance levels, and all default indicators. Start here for "analyze X".',
    schema: { symbol, timeframe, source, count: z.coerce.number().optional().describe('Bars to load (default 300)') },
    handler: (a) => analyze(a),
  },
  {
    name: 'chart_render',
    description: 'Save a candlestick chart (with EMA/SMA lines, support/resistance and volume) as an SVG file and return its path. Replaces screenshots.',
    schema: {
      symbol, timeframe, source,
      count: z.coerce.number().optional().describe('Candles to draw (default 150)'),
      overlays: z.array(z.string()).optional().describe('Lines to draw, e.g. ["ema:20","ema:50","sma:200"] (default ema:20, ema:50)'),
      show_levels: z.coerce.boolean().optional().describe('Draw support/resistance (default true)'),
      output_path: z.string().optional().describe('Where to write the .svg (default ~/.free-market-mcp/charts/)'),
    },
    handler: (a) => renderChart(a),
  },
  {
    name: 'backtest_run',
    description: `Backtest a built-in long-only strategy on historical candles (replaces Strategy Tester). Strategies: ${Object.entries(STRATEGIES).map(([k, v]) => `${k} (${v.describe})`).join('; ')}.`,
    schema: {
      symbol, timeframe, source,
      strategy: z.enum(Object.keys(STRATEGIES)).describe('Strategy name'),
      params: z.record(z.string(), z.coerce.number()).optional().describe('Override defaults, e.g. {"fast": 12, "slow": 26}'),
      count: z.coerce.number().optional().describe('Bars of history (default 1000, max 1000)'),
      fee_pct: z.coerce.number().optional().describe('Fee per side in % (default 0.1)'),
      stop_loss_pct: z.coerce.number().optional().describe('Optional stop loss in %'),
      take_profit_pct: z.coerce.number().optional().describe('Optional take profit in %'),
      max_trades: z.coerce.number().optional().describe('How many trades to list (default 20)'),
    },
    handler: (a) => runBacktest(a),
  },
  {
    name: 'batch_run',
    description: 'Run one action across several symbols and timeframes (multi-symbol scan). Actions: quote, ohlcv_summary, indicators, analyze.',
    schema: {
      symbols: z.array(z.string()).describe('Symbols, e.g. ["BTC","ETH","solana:<mint>"]'),
      action: z.enum(['quote', 'ohlcv_summary', 'indicators', 'analyze']),
      timeframes: z.array(z.string()).optional().describe('Timeframes (default ["60"]; ignored for quote)'),
      indicators: z.array(z.string()).optional().describe('Indicator specs for action=indicators'),
      ohlcv_count: z.coerce.number().optional().describe('Bars for ohlcv_summary (default 100)'),
      delay_ms: z.coerce.number().optional().describe('Pause between requests (default 1200, keeps free limits happy)'),
    },
    handler: (a) => batchRun(a),
  },
  {
    name: 'market_overview',
    description: 'Crypto market context: total market cap, BTC/ETH dominance, Fear & Greed index (7 days), trending coins.',
    schema: {},
    handler: () => market.overview(),
  },
  {
    name: 'defi_tvl',
    description: 'DeFi TVL from DefiLlama. Pass protocol for one protocol; chain and/or category for top protocols there; nothing for top chains.',
    schema: {
      protocol: z.string().optional().describe('Protocol slug or name, e.g. "aave", "jupiter", "raydium"'),
      chain: z.string().optional().describe('Chain name, e.g. "Solana", "Ethereum"'),
      category: z.string().optional().describe('Category, e.g. "Dexs", "Lending", "Liquid Staking"'),
      limit: z.coerce.number().optional().describe('Rows to return (default 15)'),
    },
    handler: (a) => market.defi(a),
  },
  {
    name: 'watchlist_list',
    description: 'Show all local watchlists.',
    schema: {},
    handler: () => watchlist.list(),
  },
  {
    name: 'watchlist_add',
    description: 'Add symbols to a local watchlist (default "main").',
    schema: { symbols: z.array(z.string()), name: z.string().optional() },
    handler: (a) => watchlist.add(a),
  },
  {
    name: 'watchlist_remove',
    description: 'Remove symbols from a local watchlist.',
    schema: { symbols: z.array(z.string()), name: z.string().optional() },
    handler: (a) => watchlist.remove(a),
  },
  {
    name: 'watchlist_quotes',
    description: 'Quote every symbol on a watchlist.',
    schema: { name: z.string().optional().describe('Watchlist name (default "main")') },
    handler: (a) => watchlist.quotes(a),
  },
  {
    name: 'alert_create',
    description: 'Create a local alert. Nothing runs in the background — use alert_check to evaluate (manually or from a scheduled task).',
    schema: {
      symbol,
      condition: z.enum(['price_above', 'price_below', 'rsi_above', 'rsi_below', 'change_24h_above', 'change_24h_below']),
      value: z.coerce.number(),
      timeframe: z.string().optional().describe('Timeframe for RSI conditions (default 60)'),
      note: z.string().optional(),
    },
    handler: (a) => alerts.create(a),
  },
  {
    name: 'alert_list',
    description: 'List local alerts (active and triggered).',
    schema: {},
    handler: () => alerts.list(),
  },
  {
    name: 'alert_delete',
    description: 'Delete one alert by id, or all with all=true.',
    schema: { id: z.string().optional(), all: z.coerce.boolean().optional() },
    handler: (a) => alerts.remove(a),
  },
  {
    name: 'alert_check',
    description: 'Evaluate all active alerts now and report which triggered. Triggered alerts are deactivated unless deactivate_triggered=false.',
    schema: { deactivate_triggered: z.coerce.boolean().optional() },
    handler: (a) => alerts.check(a),
  },
];
