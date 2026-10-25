---
name: strategy-report
description: Backtest a built-in trading strategy on crypto data and write a performance report with comparisons. Use when the user asks whether a strategy works, wants to compare parameters, or asks for a strategy report.
---

# Strategy Report Workflow

## Step 1: Pick Strategy and Market

Built-in long-only strategies for `backtest_run`:

| Strategy | Default params | Rule |
|---|---|---|
| `ema_cross` | fast 9, slow 21 | Buy on fast EMA crossing above slow, sell on cross below |
| `sma_cross` | fast 50, slow 200 | Golden cross / death cross |
| `macd_cross` | 12, 26, 9 | MACD crossing its signal line |
| `rsi_reversion` | length 14, buy_below 30, sell_above 70 | Buy oversold, sell overbought |
| `bb_reversion` | length 20, mult 2 | Buy below the lower band, sell above the middle band |

For intraday tests on a coin, use its token address (e.g. wrapped SOL) — CoinGecko coin candles are fixed at 30m/4h/4D.

## Step 2: Baseline Run

`backtest_run` with the defaults, `count: 1000`, and the user's fee (default 0.1 % per side).
Note `period`, since the free sources limit how far back 1000 bars reach.

## Step 3: Variations (2–4 runs, not a grid search)

- Different parameters, e.g. `params: {"fast": 12, "slow": 26}`
- With risk exits: `stop_loss_pct`, `take_profit_pct`
- A different timeframe

## Step 4: Report

1. **Setup** — symbol, timeframe, period, strategy, params, fees
2. **Results table** — total return vs buy & hold, trades, win rate, avg win/loss, profit factor, max drawdown, per run
3. **Read** — does it beat buy & hold after fees? Is the sample big enough (under ~20 trades is anecdotal)?
4. **Risks** — overfitting from tuning, fills at bar close without slippage, one market regime only
5. **Open position** — mention `open_position` if one exists

Always include the tool's disclaimer: past performance only, not financial advice.
