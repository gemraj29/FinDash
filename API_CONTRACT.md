# FinDash API Contract

All monetary amounts are **integers in cents** (e.g. $150.25 = 15025).  
Percentage returns are **basis points** (e.g. 1.50% = 150 bps).  
All mutating endpoints require `Idempotency-Key: <uuid>` header.  
Auth: `Authorization: Bearer <jwt>` on all endpoints.

---

## REST Endpoints

### Portfolios

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/portfolios` | List all portfolios | `Portfolio[]` |
| `GET` | `/portfolios/:id` | Get portfolio by ID | `Portfolio` |
| `POST` | `/portfolios` | Create portfolio | `Portfolio` (201) |
| `POST` | `/portfolios/:id/trades` | Record a trade | `Trade` (201) |
| `GET` | `/portfolios/:id/positions` | Get open positions | `Position[]` |
| `GET` | `/portfolios/:id/trades` | Trade history (filterable) | `Trade[]` |

#### Trade history query params
- `symbol` — filter by ticker
- `direction` — `BUY` or `SELL`
- `fromDate` — ISO 8601 date string
- `toDate` — ISO 8601 date string
- `limit` — default 100
- `offset` — default 0

### P&L

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/portfolios/:id/pnl/unrealized` | Unrealized P&L (live prices) | `PnLSummary` |
| `GET` | `/portfolios/:id/pnl/realized` | Realized P&L (date range) | `PnLSummary` |

#### Realized P&L query params
- `fromDate` — required, ISO 8601
- `toDate` — required, ISO 8601

### Tax Lots

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/positions/:positionId/cost-basis` | FIFO cost basis + open lots | `CostBasis` |

### CSV Exports

| Method | Path | Description | Response |
|--------|------|-------------|----------|
| `GET` | `/portfolios/:id/export/trades` | Download trades CSV | `text/csv` |
| `GET` | `/portfolios/:id/export/tax-lots` | Download tax lots CSV | `text/csv` |

#### Export query params (trades)
- `symbol`, `direction`, `fromDate`, `toDate`

---

## WebSocket Events (namespace: `/market`)

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `subscribe` | `{ portfolioId: string, symbols: string[] }` | Subscribe to price updates |
| `unsubscribe` | `{ symbols: string[] }` | Unsubscribe from symbols |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `price:update` | `{ symbol: string, quote: Quote }` | Real-time price tick |
| `price:error` | `{ symbol: string, message: string }` | Price feed error |

---

## Service Method Signatures (for UI→Backend contract)

```typescript
// PortfolioService
findAll(): Promise<Portfolio[]>
findById(id: string): Promise<Portfolio>
create(dto: CreatePortfolioDTO): Promise<Portfolio>
addTrade(dto: CreateTradeDTO): Promise<Trade>
getPositions(portfolioId: string): Promise<Position[]>
getTradeHistory(portfolioId: string, filters?: TradeFilter): Promise<Trade[]>

// PnlService
calculateUnrealizedPnl(portfolioId: string): Promise<PnLSummary>
calculateRealizedPnl(portfolioId: string, dateRange: DateRange): Promise<PnLSummary>

// TaxLotService
computeCostBasis(positionId: string): Promise<CostBasis>
allocateLot(trade: CreateTradeDTO & { positionId: string }): Promise<TaxLot[]>

// MarketDataService
getQuote(symbol: string): Promise<Quote | null>

// CsvExportService
exportTrades(portfolioId: string, filters?: TradeFilter): Promise<Buffer>
exportTaxLots(portfolioId: string): Promise<Buffer>
```

---

## Key Types

```typescript
Portfolio  { id, name, description, currency, taxMethod, createdAt, updatedAt }
Position   { id, portfolioId, symbol, assetClass, sharesHeld, avgCostBasisCents, ... }
Trade      { id, portfolioId, positionId, symbol, direction, shares, pricePerShareCents,
             commissionCents, notionalCents, idempotencyKey, executedAt, createdAt }
TaxLot     { id, positionId, portfolioId, symbol, sharesAcquired, sharesRemaining,
             costBasisPerShareCents, acquiredAt, closedAt, holdingPeriod }
Quote      { symbol, lastPriceCents, prevCloseCents, changeCents, changeBps,
             bidCents, askCents, volume, timestamp }
PnLSummary { portfolioId, marketValueCents, costBasisCents, unrealizedPnlCents,
             unrealizedPnlBps, realizedPnlCents, dayChangeCents, dayChangeBps, calculatedAt }
CostBasis  { positionId, symbol, totalSharesHeld, totalCostCents, avgCostPerShareCents, openLots }
```
