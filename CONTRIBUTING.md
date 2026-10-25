# Contributing

Thanks for your interest in contributing to free-market-mcp.

## Scope

This is a read-only market-data MCP server built on **free, public** APIs.

### In scope

- New free data sources or better routing between existing ones
- New indicators, analysis helpers or backtest strategies
- Reliability: rate-limit handling, error messages, caching
- Tests and documentation

### Out of scope

- Placing trades, signing transactions or handling private keys
- Scraping sites that forbid it, or bypassing paywalls and rate limits
- Paid-only data sources as a hard requirement (optional keys are fine)

## Development

```bash
npm install
npm test
npm run lint
```

- Every tool lives in `src/tools/index.js`, which both the MCP server and the CLI use — add new tools there.
- Business logic goes in `src/core/`, one module per HTTP API in `src/sources/`.
- Tests must not hit the network: use `setFetch()` from `src/http.js` to mock responses.
- All tools return `{ success: true/false, ... }`.

## Pull Requests

1. Fork and branch from `main`
2. Add tests for new behaviour
3. Make sure `npm test` and `npm run lint` pass
4. Explain what changed and why
