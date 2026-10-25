# Security Policy

## Reporting a Vulnerability

Please report vulnerabilities through [GitHub Security Advisories](https://github.com/nzaincreatives/free-market-mcp/security/advisories/new).
**Do not** open a public issue for security vulnerabilities.

## Scope

This server makes outbound HTTPS requests to public market-data APIs (CoinGecko, GeckoTerminal, DexScreener, DefiLlama, alternative.me and, if a key is set, Birdeye) and writes JSON/SVG files to `~/.free-market-mcp/`. In scope:

- Injection via crafted tool inputs (URLs, file paths, SVG output)
- Leaking API keys through tool output, logs or errors
- Writing files outside the intended locations
- Vulnerabilities in the MCP server or CLI that could be exploited locally

## Out of Scope

- Security or data accuracy of the third-party APIs (report to the provider)
- Claude Code or MCP SDK security (report to Anthropic)

## Best Practices for Users

- Keep API keys in environment variables or your MCP client's `env` block, never in the repository
- Rotate a key if it was pasted into a chat, issue or commit
- `chart_render`'s `output_path` writes wherever you point it — only pass paths you trust
- Keep Node.js up to date
