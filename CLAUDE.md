# Free Market MCP — Claude Instructions

19 tools for crypto price data, indicators, analysis and backtests from free public APIs. No TradingView, no browser.

## Symbols

- Coin: ticker, name or CoinGecko id — `BTC`, `solana`, `jupiter-exchange-solana`
- DEX token: `<chain>:<address>` — `solana:<mint>`, `base:0x…` — or a bare Solana mint
- Unsure → `symbol_search`, then pass the result's `use_as` value

Coins use CoinGecko's free OHLC: candles are fixed at 30m (≤30), 4h (≤240) or 4D (above), with no per-candle volume.
The response says so in `timeframe`, `requested_timeframe` and `note`. When the user needs an exact timeframe or volume (VWAP, volume analysis), use a token address instead (wrapped SOL: `solana:So11111111111111111111111111111111111111112`).

## Decision Tree — Which Tool When

- "Analyze X" / "what does the chart say" → `chart_analyze` (one call: trend, levels, summary, indicators)
- "What's the price" → `quote_get`
- "Give me candles" → `data_get_ohlcv` with `summary: true` unless individual bars are needed
- Specific indicators or custom lengths → `indicators_get` with specs like `rsi:7`, `ema:200`, `macd:8:21:5`, `bb:20:2.5`
- "Show me the chart" → `chart_render`, then show or open the returned SVG path
- "Would this strategy have worked" → `backtest_run` (`ema_cross`, `sma_cross`, `macd_cross`, `rsi_reversion`, `bb_reversion`)
- Several symbols → `batch_run` (actions: `quote`, `ohlcv_summary`, `indicators`, `analyze`)
- Market mood → `market_overview`; DeFi → `defi_tvl`
- Watchlists → `watchlist_list/add/remove/quotes`
- Alerts → `alert_create`, then `alert_check` to evaluate (nothing runs in the background)
- Something fails → `health_check`

## Context and Rate-Limit Rules

1. Always pass `summary: true` to `data_get_ohlcv` unless bars are explicitly needed.
2. Free tiers allow ~30 requests/min per source. Prefer one `chart_analyze` over several separate calls.
3. Keep `batch_run`'s default delay; for more than ~10 symbols use `action: "quote"` first and analyze only the interesting ones.
4. On `HTTP 429`, wait a minute rather than retrying in a loop.

## Conventions

- All tools return `{ success: true/false, ... }`; errors include a readable `error`.
- OHLCV is capped at 1000 bars.
- Prices under 1 keep 6 significant digits (micro-cap tokens).
- Local data lives in `~/.free-market-mcp/` (`FREE_MARKET_MCP_HOME` overrides).
- Never describe outputs as financial advice; nothing here places trades.

## Architecture

```
Claude ←→ MCP server (stdio) ←→ src/tools/index.js ←→ src/core/* ←→ src/sources/* ←→ public HTTP APIs
```

The tool registry in `src/tools/index.js` is shared by the MCP server and the CLI (`src/cli/index.js`).
