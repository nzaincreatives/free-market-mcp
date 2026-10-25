#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TOOLS } from './tools/index.js';
import { jsonResult } from './tools/_format.js';

const server = new McpServer(
  {
    name: 'free-market',
    version: '3.0.0',
    description: 'Crypto chart analysis from free data sources (CoinGecko, GeckoTerminal, DexScreener, DefiLlama, Birdeye) — no TradingView needed',
  },
  {
    instructions: `Free Market MCP — ${TOOLS.length} tools for crypto price data, indicators, analysis and backtests. No TradingView, no browser, no paid subscription.

SYMBOLS: pass a coin ticker/name ("BTC", "solana") or a token address ("solana:<mint>", "base:0x…", or a bare Solana mint).
Coins come from CoinGecko (candles fixed at 30m/4h/4D, no per-candle volume). For any timeframe with volume, use a token address — GeckoTerminal (free) or Birdeye (if BIRDEYE_API_KEY is set).
Not sure of the symbol? → symbol_search, then use the returned use_as value.

TOOL SELECTION GUIDE:
- "Analyze X" → chart_analyze (one call: trend, levels, indicators)
- Price now → quote_get
- Candles → data_get_ohlcv with summary=true unless you need individual bars
- Specific indicators → indicators_get (rsi, ema:N, sma:N, macd, bb, atr, stoch, vwap)
- Picture of the chart → chart_render (writes an SVG, returns the path)
- "Would this strategy have worked?" → backtest_run
- Several symbols → batch_run
- Market mood → market_overview; DeFi → defi_tvl
- Watchlists and alerts are stored locally; alert_check evaluates alerts on demand.

Free tiers allow roughly 30 requests/minute per source. Prefer summary=true and batch_run's default delay.
Nothing here places trades. Outputs are data, not financial advice.`,
  },
);

for (const t of TOOLS) {
  server.tool(t.name, t.description, t.schema, async (args) => {
    try { return jsonResult(await t.handler(args || {})); }
    catch (err) { return jsonResult({ success: false, error: err.message }, true); }
  });
}

const transport = new StdioServerTransport();
await server.connect(transport);
