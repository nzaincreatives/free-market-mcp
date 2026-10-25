---
name: multi-symbol-scan
description: Scan several crypto coins or tokens at once — rank by momentum, RSI or trend and pick the setups worth a closer look. Use when the user wants to compare symbols, screen a watchlist, or find opportunities.
---

# Multi-Symbol Scan Workflow

## Step 1: Build the List

- User named symbols → use them (resolve unclear ones with `symbol_search`)
- "Scan my watchlist" → `watchlist_list`, then use its symbols
- "What's moving" → `market_overview` and take its trending coins

## Step 2: Cheap First Pass

Run `batch_run` with `action: "quote"`, or `watchlist_quotes` for a saved list.
That is one light call per symbol (coins on a watchlist share a single CoinGecko call).

## Step 3: Indicator Pass on the Shortlist

Pick the 3–8 most interesting from step 2 and run
`batch_run` with `action: "indicators"`, `timeframes: ["240"]` (or what the user asked), `indicators: ["rsi", "ema:50", "macd", "atr"]`.

Free APIs allow ~30 requests/min — keep the default `delay_ms` and avoid scanning dozens of symbols with heavy actions.

## Step 4: Rank and Present

Build a table: symbol, price, 24h %, RSI (state), price vs EMA 50, MACD momentum, ATR %.
Sort by what the user cares about (strongest trend, most oversold, highest volatility).

## Step 5: Deep Dive

Offer `chart_analyze` on the top 1–3 and `chart_render` for a visual.
Report failures from `batch_run` (`success: false`) rather than silently dropping them.
