---
name: chart-analysis
description: Technical analysis of a crypto coin or DEX token from free data — trend, support/resistance, indicators and a rendered chart. Use when the user wants a chart read, levels, or "what does X look like".
---

# Chart Analysis Workflow

You are analysing a crypto chart with the free-market MCP tools.

## Step 1: Resolve the Symbol

- Well-known coin → pass the ticker (`BTC`, `SOL`)
- Token, memecoin or anything ambiguous → `symbol_search`, then use the result's `use_as`
- Need an exact timeframe or volume-based reads (VWAP)? Use a token address; coins only get CoinGecko's 30m/4h/4D candles without volume

## Step 2: One-Call Read

Call `chart_analyze` with the symbol and timeframe (default `60`; use `240` or `D` for swing views).
It returns trend, a 100-bar summary, support/resistance with touch counts, and RSI, EMA 20/50/200, MACD, Bollinger, ATR, Stochastic and VWAP.

Check `timeframe` vs `requested_timeframe` and any `note` — tell the user if the candle size differs from what they asked for.

## Step 3: Drill Down (only if needed)

- Other lengths or extra indicators → `indicators_get` with e.g. `["rsi:7", "ema:100", "bb:20:2.5"]`
- Higher-timeframe context → a second `chart_analyze` on `D`
- DEX token health → `quote_get` (liquidity, 24h buys/sells, market cap)
- Market backdrop → `market_overview` (BTC dominance, Fear & Greed)

## Step 4: Visual

`chart_render` writes an SVG with candles, EMA lines, levels and volume. Share the returned file path or open it.

## Step 5: Report

1. **Price & trend** — current price, direction and why
2. **Key levels** — nearest resistance and support with distance in %
3. **Indicators** — what RSI, MACD, Bollinger and Stochastic say together
4. **Volatility** — ATR as % of price
5. **Bias** — bullish, bearish or neutral, with what would change it

Keep it short. State that this is data, not financial advice.
