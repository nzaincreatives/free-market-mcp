import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TOOLS } from '../src/tools/index.js';
import { jsonResult } from '../src/tools/_format.js';
import { MEXC_TOOLS } from './mexc.js';
import { CMC_TOOLS } from './cmc.js';

// Tools that read or write local files cannot work on a serverless host.
const LOCAL_ONLY = /^(watchlist_|alert_|chart_render$)/;

export function selectTools({ hosted = false } = {}) {
  return hosted ? [...TOOLS.filter((t) => !LOCAL_ONLY.test(t.name)), ...MEXC_TOOLS, ...CMC_TOOLS] : TOOLS;
}

function instructions(tools, hosted) {
  const text = `Free Market MCP — ${tools.length} tools for crypto price data, indicators, analysis and backtests. No TradingView, no browser, no paid subscription.

SYMBOLS: pass a coin ticker/name ("BTC", "solana") or a token address ("solana:<mint>", "base:0x…", or a bare Solana mint).
Coins come from CoinGecko (candles fixed at 30m/4h/4D, no per-candle volume). For any timeframe with volume, use a token address — GeckoTerminal (free) or Birdeye (if BIRDEYE_API_KEY is set).
Not sure of the symbol? → symbol_search, then use the returned use_as value.

TOOL SELECTION GUIDE:
- "Analyze X" → chart_analyze (one call: trend, levels, indicators)
- Price now → quote_get
- Candles → data_get_ohlcv with summary=true unless you need individual bars
- Specific indicators → indicators_get (rsi, ema:N, sma:N, macd, bb, atr, stoch, vwap)
${hosted ? '' : '- Picture of the chart → chart_render (writes an SVG, returns the path)\n'}- "Would this strategy have worked?" → backtest_run
- Several symbols → batch_run
- Market mood (BTC dominance, Fear & Greed) → market_overview; DeFi → defi_tvl
${hosted ? '- Live exchange data from MEXC (spot + perpetuals: funding, open interest, basis, order book, candles with volume) → mexc_market, mexc_candles, mexc_funding_history\n- CoinMarketCap cross-check (aggregated price, rank, market cap, FDV, supply, global metrics, dominance) → cmc_quotes, cmc_global\n' : ''}
${hosted ? '' : '- Watchlists and alerts are stored locally; alert_check evaluates alerts on demand.\n'}
Free tiers allow roughly 30 requests/minute per source. Prefer summary=true and batch_run's default delay.
Nothing here places trades. Outputs are data, not financial advice.`;
  return text;
}

export function createServer({ hosted = false } = {}) {
  const tools = selectTools({ hosted });
  const server = new McpServer(
    {
      name: 'free-market',
      version: '3.0.0',
      description: 'Crypto chart analysis from free data sources (CoinGecko, GeckoTerminal, DexScreener, DefiLlama, Birdeye) — no TradingView needed',
    },
    { instructions: instructions(tools, hosted) },
  );
  for (const t of tools) {
    server.tool(t.name, t.description, t.schema, async (args) => {
      try { return jsonResult(await t.handler(args || {})); }
      catch (err) { return jsonResult({ success: false, error: err.message }, true); }
    });
  }
  return server;
}
