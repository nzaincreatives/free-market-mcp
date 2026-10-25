# Free Market MCP

Krypto-Chartanalyse für Claude, **ohne TradingView**: keine Desktop-App, kein Abo, kein Browser-Debug-Port.
Der Server holt Kurse und Kerzen von kostenlosen öffentlichen APIs und rechnet Indikatoren, Support/Resistance und Backtests lokal.

> [!NOTE]
> **Herkunft:** Umbau von [bottradingnet/tradingview-mcp](https://github.com/bottradingnet/tradingview-mcp), das selbst ein Fork von [tradesdontlie/tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) ist (MIT-Lizenz). Die TradingView-Steuerung per Chrome DevTools Protocol wurde komplett durch freie Datenquellen ersetzt.

> [!IMPORTANT]
> Nur **Krypto** (Coins und DEX-Token). Aktien, Forex und Futures gibt es bei diesen Quellen nicht.
> Der Server führt **keine Trades** aus und gibt keine Anlageberatung.

## Datenquellen

| Quelle | Key nötig? | Wofür |
|---|---|---|
| [CoinGecko](https://www.coingecko.com/en/api) | nein (optional `COINGECKO_API_KEY`) | Coin-Kurse, Coin-Kerzen, Marktdaten, Trending |
| [GeckoTerminal](https://www.geckoterminal.com/dex-api) | nein | DEX-Kerzen mit Volumen, jede Kerzengröße |
| [DexScreener](https://docs.dexscreener.com) | nein | DEX-Kurse, Liquidität, Käufe/Verkäufe, Suche |
| [DefiLlama](https://defillama.com/docs/api) | nein | TVL von Protokollen und Chains |
| [alternative.me](https://alternative.me/crypto/fear-and-greed-index/) | nein | Fear & Greed Index |
| [Birdeye](https://bds.birdeye.so) | ja, `BIRDEYE_API_KEY` | DEX-Kerzen (wird bevorzugt, wenn der Key gesetzt ist) |

Ohne jeden Key funktioniert alles. Die kostenlosen Stufen erlauben etwa 30 Anfragen pro Minute pro Quelle; bei HTTP 429 wartet der Server und versucht es erneut.

## Symbole

| Eingabe | Bedeutung |
|---|---|
| `BTC`, `ETH`, `solana`, `jupiter-exchange-solana` | Coin über CoinGecko (Ticker, Name oder ID) |
| `solana:<mint>`, `base:0x…`, `ethereum:0x…` | DEX-Token auf dieser Chain |
| `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | nackte Solana-Mint-Adresse |

Unsicher? `symbol_search` liefert zu jedem Treffer einen `use_as`-Wert, den du direkt weitergeben kannst.

**Wichtig zu Kerzen:** Die kostenlose CoinGecko-API hat feste Kerzengrößen (30 min, 4 h oder 4 Tage) und kein Volumen pro Kerze.
Für beliebige Timeframes mit Volumen nimm eine Token-Adresse, z. B. für SOL `solana:So11111111111111111111111111111111111111112` (Wrapped SOL).

## Tools

| Tool | Was es macht | Ersetzt in TradingView |
|---|---|---|
| `chart_analyze` | Trend, Support/Resistance, Zusammenfassung und alle Standard-Indikatoren in einem Aufruf | Chart lesen + Pine-Levels |
| `quote_get` | Aktueller Kurs, 24h-Änderung, Volumen, Market Cap, Liquidität | `quote_get` |
| `data_get_ohlcv` | Kerzen; `summary=true` für eine kompakte Zusammenfassung | `data_get_ohlcv` |
| `indicators_get` | RSI, EMA, SMA, MACD, Bollinger, ATR, Stochastik, VWAP mit eigenen Parametern | `data_get_study_values` |
| `chart_render` | Kerzenchart mit Linien, Levels und Volumen als SVG-Datei | `capture_screenshot` |
| `backtest_run` | Backtest eingebauter Strategien (EMA-/SMA-/MACD-Cross, RSI-/Bollinger-Reversion) | Strategy Tester |
| `batch_run` | Eine Aktion über viele Symbole und Timeframes | `batch_run` |
| `symbol_search` | Coins und DEX-Token finden | `symbol_search` |
| `market_overview` | Gesamt-Market-Cap, BTC-Dominanz, Fear & Greed, Trending | – |
| `defi_tvl` | TVL für Protokolle, Chains und Kategorien | – |
| `watchlist_*` | Lokale Watchlists anlegen, ändern, alle Kurse abrufen | Watchlist |
| `alert_*` | Lokale Preis-/RSI-/Änderungs-Alerts; `alert_check` prüft sie | Alerts |
| `health_check` | Welche Quellen erreichbar und welche Keys gesetzt sind | `tv_health_check` |

Watchlists, Alerts und Charts liegen in `~/.free-market-mcp/` (änderbar mit `FREE_MARKET_MCP_HOME`).
Alerts laufen **nicht im Hintergrund**. Lass `alert_check` manuell oder über eine geplante Aufgabe laufen.

**Nicht mehr enthalten**, weil es nur mit der TradingView-App geht: Pine Script, Zeichnen auf dem Chart, Replay, Layouts, UI-Steuerung.

## Installation

Voraussetzung: [Node.js 20+](https://nodejs.org).

```bash
git clone https://github.com/nzaincreatives/free-market-mcp.git ~/free-market-mcp
```

```bash
cd ~/free-market-mcp && npm install
```

### In Claude Code einbinden

```bash
claude mcp add free-market --scope user -- node ~/free-market-mcp/src/server.js
```

Oder manuell in `~/.claude.json` bzw. der MCP-Konfiguration deines Clients:

```json
{
  "mcpServers": {
    "free-market": {
      "command": "node",
      "args": ["/Users/DEIN_NAME/free-market-mcp/src/server.js"],
      "env": { "BIRDEYE_API_KEY": "optional" }
    }
  }
}
```

Danach eine neue Session starten und z. B. fragen: *„Analysiere SOL im 4h-Chart“* oder *„Backteste EMA-Cross auf BONK im 1h“*.

## CLI

Jedes Tool gibt es auch auf der Kommandozeile (`npm link` macht `fm` global verfügbar):

```bash
node src/cli/index.js chart_analyze symbol=BTC timeframe=240
```

```bash
node src/cli/index.js batch_run symbols=BTC,ETH,SOL action=quote
```

`node src/cli/index.js --help` listet alle Tools, `… <tool> --help` zeigt die Argumente. Listen werden mit Kommas getrennt, Objekte als JSON übergeben (`params='{"fast":12}'`).

## Entwicklung

```bash
npm test
```

Die Tests mocken alle HTTP-Aufrufe und brauchen kein Netzwerk. `npm run lint` prüft den Code mit ESLint.

## Haftungsausschluss

Dieses Projekt ist nicht mit TradingView, CoinGecko, DexScreener, DefiLlama, Birdeye oder Anthropic verbunden.
Alle Daten kommen ungeprüft von Drittanbietern und können verzögert oder falsch sein. Backtests zeigen Vergangenheit, keine Zukunft.
Nutzung auf eigenes Risiko. Keine Anlageberatung.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
