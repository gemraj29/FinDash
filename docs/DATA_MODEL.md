# FinDash — Data Model

## Entity Relationship Diagram

```mermaid
erDiagram
    Portfolio {
        uuid id PK
        string name
        string description
        string currency "ISO 4217 e.g. USD"
        enum taxMethod "FIFO"
        datetime createdAt
        datetime updatedAt
    }

    Position {
        uuid id PK
        uuid portfolioId FK
        string symbol "ticker e.g. AAPL"
        enum assetClass "EQUITY ETF OPTION CRYPTO FIXED_INCOME"
        decimal sharesHeld "Decimal(18,8) — fractional shares"
        int avgCostBasisCents "weighted avg in cents"
        datetime openedAt
        datetime updatedAt
    }

    TaxLot {
        uuid id PK
        uuid positionId FK
        uuid portfolioId FK
        string symbol
        decimal sharesAcquired "original lot size"
        decimal sharesRemaining "decrements on SELL (FIFO)"
        int costBasisPerShareCents "acquisition price in cents"
        datetime acquiredAt "FIFO ordering key"
        datetime closedAt "null if still open"
        enum holdingPeriod "SHORT_TERM LONG_TERM"
    }

    Trade {
        uuid id PK
        uuid portfolioId FK
        uuid positionId FK
        string symbol
        enum direction "BUY SELL"
        decimal shares "Decimal(18,8)"
        int pricePerShareCents "execution price"
        int commissionCents "fees"
        int notionalCents "shares × price"
        string idempotencyKey UK "prevents duplicates"
        datetime executedAt
        datetime createdAt
    }

    PriceSnapshot {
        uuid id PK
        string symbol
        int priceCents "last trade price"
        int prevCloseCents "previous close"
        datetime capturedAt
    }

    LedgerEntry {
        uuid id PK
        uuid portfolioId FK
        string entryType "TRADE COMMISSION DIVIDEND"
        int amountCents "positive=credit negative=debit"
        string description
        uuid referenceId "tradeId"
        datetime createdAt
    }

    Portfolio ||--o{ Position : "has"
    Portfolio ||--o{ Trade : "records"
    Portfolio ||--o{ TaxLot : "holds"
    Portfolio ||--o{ LedgerEntry : "tracks"
    Position ||--o{ TaxLot : "split into"
```

---

## Key Design Decisions

### All Amounts in Cents (Int)
```
$150.25 → 15025 cents
 -$3.99 → -399 cents
```
Never store floats for money. Eliminates floating-point rounding errors in FIFO calculations.

### Append-Only Tables

| Table | Mutable? | Reason |
|-------|----------|--------|
| `trades` | ❌ Never | Immutable audit trail |
| `tax_lots` | Partial | Only `sharesRemaining`, `closedAt`, `holdingPeriod` update |
| `ledger_entries` | ❌ Never | Double-entry integrity |
| `positions` | ✅ Yes | Aggregate view — `sharesHeld`, `avgCostBasisCents` |
| `portfolios` | ✅ Yes | Metadata only |

### Idempotency Key (Unique Constraint)

Every trade mutation requires a client-generated UUID in the `Idempotency-Key` header. Stored as a unique column on `trades` — duplicate submissions get a `409 Conflict` rather than a double-booking.

### Double-Entry Ledger

Every trade creates two `ledger_entries`:
```
BUY  50 AAPL @ $165 → debit  $8,250.00 (amountCents: -825000)
                     → debit  $0.99 commission (amountCents: -99)

SELL 30 AAPL @ $185 → credit $5,550.00 (amountCents: +555000)
                     → debit  $0.99 commission (amountCents: -99)
```

---

## Indexes

| Table | Index | Purpose |
|-------|-------|---------|
| `positions` | `(portfolioId, symbol)` UNIQUE | One position per symbol per portfolio |
| `tax_lots` | `(positionId, acquiredAt)` | FIFO ordering — oldest first |
| `trades` | `(portfolioId, executedAt)` | Time-series queries |
| `trades` | `idempotencyKey` UNIQUE | Duplicate rejection |
| `price_snapshots` | `(symbol, capturedAt)` | Latest price lookup |
