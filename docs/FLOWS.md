# FinDash — System Flows

## 1. FIFO Tax-Lot Allocation Flow

The core fintech logic — how shares are allocated on BUY and consumed on SELL.

```mermaid
flowchart TD
    START([Trade received]) --> DIR{Direction?}

    DIR -->|BUY| BUY_LOT["Open new TaxLot\nsharesAcquired = shares\nsharesRemaining = shares\ncostBasisPerShareCents = price\nacquiredAt = now"]
    BUY_LOT --> UPDATE_POS_BUY["Update Position\nsharesHeld += shares\navgCostBasis = weighted average"]
    UPDATE_POS_BUY --> LEDGER_BUY["Write LedgerEntry\namountCents = -(shares × price)\ntype = TRADE"]
    LEDGER_BUY --> DONE([✅ Done])

    DIR -->|SELL| CHECK["Load open lots\nORDER BY acquiredAt ASC\n(oldest first = FIFO)"]
    CHECK --> ENOUGH{Enough\nshares?}
    ENOUGH -->|No| ERROR([❌ INSUFFICIENT_SHARES])
    ENOUGH -->|Yes| CONSUME["For each lot (oldest first):\n• consume min(remaining, needed)\n• decrement sharesRemaining\n• if sharesRemaining = 0: stamp closedAt\n• stamp holdingPeriod\n  (≥365d = LONG_TERM)"]
    CONSUME --> UPDATE_POS_SELL["Update Position\nsharesHeld -= shares\navgCostBasis unchanged"]
    UPDATE_POS_SELL --> LEDGER_SELL["Write LedgerEntry\namountCents = +(shares × price)\ntype = TRADE"]
    LEDGER_SELL --> DONE

    style ERROR fill:#ef4444,color:#fff
    style DONE fill:#22c55e,color:#000
    style START fill:#3b82f6,color:#fff
```

### FIFO Example

```
Initial lots (oldest first):
  Lot 1: 50 shares @ $165  (acquired day 1)
  Lot 2: 25 shares @ $150  (acquired day 2)

SELL 30 shares:
  → consume 30 from Lot 1 (50 → 20 remaining)
  → Lot 2 untouched

Result:
  Lot 1: sharesRemaining = 20  (still open)
  Lot 2: sharesRemaining = 25  (untouched)
  Position: sharesHeld = 45
```

---

## 2. Unrealized P&L Calculation Flow

```mermaid
flowchart LR
    START(["GET /portfolios/:id\n/pnl/unrealized"]) --> POSITIONS["Load open positions\n(sharesHeld > 0)"]
    POSITIONS --> SYMBOLS["Extract symbols\n[AAPL, MSFT, NVDA...]"]
    SYMBOLS --> REDIS{Redis\ncache hit?}
    REDIS -->|"HIT (< 5s)"| USE_REDIS["Use cached quote\npriceCents"]
    REDIS -->|"MISS"| DB_FALLBACK["Load latest price_snapshot\nfrom PostgreSQL"]
    USE_REDIS --> CALC
    DB_FALLBACK --> CALC["For each position:\n• marketValue = sharesHeld × currentPrice\n• costBasis = sharesHeld × avgCostBasis\n• unrealizedPnl = marketValue - costBasis\n• dayChange = currentPrice - prevClose"]
    CALC --> AGGREGATE["Sum across all positions:\n• totalMarketValue\n• totalCostBasis\n• totalUnrealizedPnl\n• totalDayChange"]
    AGGREGATE --> BPS["Convert to basis points:\npnlBps = (pnl / costBasis) × 10000"]
    BPS --> RESPONSE(["Return PnLSummary"])

    style REDIS fill:#ef4444,color:#fff
    style RESPONSE fill:#22c55e,color:#000
```

---

## 3. Trade Recording Flow (Full Transaction)

```mermaid
sequenceDiagram
    participant Client
    participant IdempotencyMiddleware
    participant PortfolioService
    participant TaxLotService
    participant PostgreSQL

    Client->>IdempotencyMiddleware: POST /portfolios/:id/trades<br/>Idempotency-Key: abc-123
    IdempotencyMiddleware->>PostgreSQL: Check trade.idempotencyKey = 'abc-123'
    alt Already exists
        PostgreSQL-->>IdempotencyMiddleware: Found
        IdempotencyMiddleware-->>Client: 409 Conflict
    else New trade
        PostgreSQL-->>IdempotencyMiddleware: Not found
        IdempotencyMiddleware->>PortfolioService: addTrade(dto)

        PortfolioService->>PostgreSQL: BEGIN TRANSACTION

        PortfolioService->>PostgreSQL: UPSERT positions<br/>(portfolioId, symbol)
        PortfolioService->>PostgreSQL: INSERT trades<br/>(append-only)
        PortfolioService->>PostgreSQL: UPDATE positions<br/>(sharesHeld, avgCostBasis)
        PortfolioService->>TaxLotService: allocateLot(dto)

        alt BUY
            TaxLotService->>PostgreSQL: INSERT tax_lots<br/>(new lot, full shares)
        else SELL
            TaxLotService->>PostgreSQL: SELECT tax_lots<br/>ORDER BY acquiredAt ASC
            TaxLotService->>PostgreSQL: UPDATE tax_lots<br/>(decrement sharesRemaining)
        end

        PortfolioService->>PostgreSQL: INSERT ledger_entries<br/>(double-entry)
        PortfolioService->>PostgreSQL: COMMIT

        PostgreSQL-->>PortfolioService: Trade record
        PortfolioService-->>Client: 201 Created { trade }
    end
```

---

## 4. Frontend Data Flow

```mermaid
flowchart TB
    subgraph Pages["Dashboard Pages"]
        OV["Overview\n/dashboard"]
        POS["Positions\n/dashboard/positions"]
        TAX["Tax Lots\n/dashboard/tax-lots"]
        TRD["Trades\n/dashboard/trades"]
        EXP["Export\n/dashboard/export"]
    end

    subgraph Shell["DashboardShell"]
        SELECT["Portfolio Selector\n(auto-selects first)"]
        SIDEBAR["Sidebar Nav"]
    end

    subgraph Hooks["SWR Hooks (auto-refresh)"]
        H1["usePortfolios()\nGET /portfolios"]
        H2["usePositions(portfolioId)\nGET /positions\n↺ 30s"]
        H3["useUnrealizedPnl(portfolioId)\nGET /pnl/unrealized\n↺ 10s"]
        H4["useTrades(portfolioId)\nGET /trades"]
        H5["useMarketData(symbols)\nWebSocket /market"]
    end

    subgraph API["REST API"]
        EP1["GET /portfolios"]
        EP2["GET /portfolios/:id/positions"]
        EP3["GET /portfolios/:id/pnl/unrealized"]
        EP4["GET /portfolios/:id/trades"]
        EP5["GET /positions/:id/cost-basis"]
    end

    OV --> H3
    POS --> H2
    POS --> H5
    TAX --> H2
    TAX --> EP5
    TRD --> H4
    Shell --> H1
    H1 --> EP1
    H2 --> EP2
    H3 --> EP3
    H4 --> EP4
```

---

## 5. CSV Export Flow

```mermaid
flowchart LR
    USER(["User clicks\nDownload"]) --> PANEL["CsvExportPanel\nselects: Trades or Tax Lots\napplies: date range, symbol filter"]
    PANEL -->|"GET /export/trades"| CTRL["CsvExportController"]
    CTRL --> SVC["CsvExportService\nexportTrades(portfolioId, filters)"]
    SVC --> PRISMA["Prisma query\nwith filters applied"]
    PRISMA --> DATA["Raw trade rows\n(amounts in cents)"]
    DATA --> FORMAT["csv-stringify\n• adds USD columns (cents ÷ 100)\n• formats dates ISO 8601\n• adds headers"]
    FORMAT --> BUFFER["Buffer (text/csv)"]
    BUFFER --> RESPONSE["HTTP Response\nContent-Disposition: attachment\nfilename: trades_<id>_<date>.csv"]
    RESPONSE --> DOWNLOAD(["💾 File downloaded\nto user's machine"])

    style USER fill:#3b82f6,color:#fff
    style DOWNLOAD fill:#22c55e,color:#000
```
