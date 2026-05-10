# FinDash — Usage Guide

## Starting the App

### Option A — Double-Click (Recommended)

1. Open Finder → navigate to the `findash/` folder
2. Double-click **`FinDash.command`**
3. Terminal opens and handles everything automatically
4. Browser opens at `http://localhost:3000` after ~15 seconds

> First launch takes longer (~2 min) to pull Docker images and seed the database.
> Subsequent launches are fast (~15s).

### Option B — Terminal

```bash
cd /path/to/findash
yarn dev:start
```

Then in a second terminal, load sample data (first time only):
```bash
yarn db:seed
```

---

## Dashboard Pages

### Overview (`/dashboard`)

Displays the top-level P&L summary for the selected portfolio:

| Card | What it shows |
|------|--------------|
| Total Value | Sum of all positions at current market prices |
| Unrealized P&L | Market value minus cost basis (green = gain, red = loss) |
| Realized YTD | Gains/losses from closed trades this year |
| Day Change | Dollar and % change from previous close |

The portfolio selector in the sidebar auto-selects your first portfolio. Click the dropdown to switch.

---

### Positions (`/dashboard/positions`)

Live table of all open positions:

| Column | Description |
|--------|-------------|
| Symbol | Ticker (e.g. AAPL) |
| Shares | Current shares held |
| Avg Cost | Weighted average cost per share |
| Current Price | Live price (WebSocket) or last snapshot |
| Market Value | Shares × Current Price |
| Unrealized P&L | Market Value − (Shares × Avg Cost) |
| P&L % | Percentage gain/loss |

Prices update in real-time via WebSocket when Kafka market data is flowing. Without a live feed, prices come from the seeded `price_snapshots` table.

---

### Tax Lots (`/dashboard/tax-lots`)

FIFO lot breakdown per symbol. Expand each symbol to see individual lots:

| Column | Description |
|--------|-------------|
| Lot Date | When shares were acquired |
| Shares Acquired | Original lot size |
| Shares Remaining | Still open (decrements on SELL) |
| Cost Basis/Share | Acquisition price per share |
| Total Cost | Shares Remaining × Cost Basis/Share |
| Holding Period | SHORT_TERM (< 1yr) or LONG_TERM (≥ 1yr) |
| Status | Open or Closed |

**Tax note**: FIFO means oldest lots are sold first. Long-term gains (held > 1 year) are typically taxed at a lower rate than short-term gains.

---

### Trade History (`/dashboard/trades`)

Filterable log of all recorded trades (newest first):

**Filters available:**
- Symbol (e.g. `AAPL`)
- Direction: BUY / SELL / All
- Date range: From → To

| Column | Description |
|--------|-------------|
| Date | Execution timestamp |
| Symbol | Ticker |
| Direction | BUY (green) / SELL (red) |
| Shares | Quantity traded |
| Price/Share | Execution price |
| Commission | Fees paid |
| Notional | Gross value (shares × price) |

All trades are immutable — the log is append-only.

---

### Export (`/dashboard/export`)

Download your data as CSV:

1. **Select export type**: Trades or Tax Lots
2. **Apply filters** (optional): date range, symbol
3. Click **Download CSV**

**Trades CSV columns**: `date, symbol, direction, shares, price_per_share_usd, price_per_share_cents, commission_usd, commission_cents, notional_usd, notional_cents, idempotency_key`

**Tax Lots CSV columns**: `symbol, shares_acquired, shares_remaining, cost_basis_per_share_usd, cost_basis_per_share_cents, acquired_at, closed_at, holding_period`

---

## Recording a Trade (API)

The dashboard doesn't have a trade entry UI yet — use the API directly:

```bash
curl -X POST http://localhost:3001/portfolios/portfolio-tech-growth/trades \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "symbol": "NVDA",
    "direction": "BUY",
    "shares": 5,
    "pricePerShareCents": 62500,
    "commissionCents": 99,
    "executedAt": "2024-03-15T14:30:00Z"
  }'
```

> `pricePerShareCents: 62500` = $625.00 per share

The `Idempotency-Key` header (any UUID) prevents the trade from being recorded twice if the request is retried.

---

## Creating a New Portfolio (API)

```bash
curl -X POST http://localhost:3001/portfolios \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Retirement Account",
    "description": "Long-term IRA holdings",
    "currency": "USD"
  }'
```

The new portfolio will appear in the sidebar selector immediately.

---

## Stopping the App

In the terminal running the app, press **Ctrl+C**. Docker services (Postgres, Redis, Kafka) keep running in the background — they use minimal resources.

To stop Docker services too:
```bash
yarn docker:down
```

---

## Seed Data Reference

The sample data loaded by `yarn db:seed`:

### Portfolio: Tech Growth (`portfolio-tech-growth`)

| Symbol | Shares | Avg Cost | Lots | Holding |
|--------|--------|----------|------|---------|
| AAPL | 45 | $156.67 | 2 | Long-term |
| MSFT | 25 | $298.00 | 2 | Mixed |
| NVDA | 10 | $450.00 | 1 | Long-term |
| GOOGL | 8 | $135.00 | 1 | Short-term |

### Portfolio: ETF Core (`portfolio-etf-core`)

| Symbol | Shares | Avg Cost | Asset Class |
|--------|--------|----------|-------------|
| SPY | 15 | $440.00 | ETF |
| QQQ | 10 | $370.00 | ETF |
| BND | 50 | $73.50 | Fixed Income |

### Seeded Price Snapshots

| Symbol | Price | Prev Close | Approx P&L |
|--------|-------|------------|------------|
| AAPL | $187.50 | $185.00 | +19.7% |
| MSFT | $378.40 | $371.20 | +26.9% |
| NVDA | $621.30 | $618.50 | +38.1% |
| GOOGL | $142.80 | $141.00 | +5.8% |
| SPY | $476.20 | $473.00 | +8.2% |
| QQQ | $416.90 | $413.00 | +12.7% |
| BND | $72.80 | $73.10 | −0.9% |

---

## Troubleshooting

### "No portfolios yet" on dashboard
The API isn't returning data. Check:
1. Is the API running? Visit `http://localhost:3001/portfolios` in browser
2. Did you run `yarn db:seed`? Check if seed data was loaded
3. Any errors in the terminal running `yarn dev:start`?

### API not starting ("Cannot find module dist/main")
Stale build cache. Run:
```bash
cd findash/apps/api
rm -rf dist tsconfig.build.tsbuildinfo
cd ../..
yarn workspace @findash/api dev
```

### Docker not starting
Open Docker Desktop manually, wait for the whale icon in the menu bar to be steady, then retry `FinDash.command`.

### Port already in use
Something else is on port 3000 or 3001. Find and kill it:
```bash
lsof -ti:3001 | xargs kill -9
lsof -ti:3000 | xargs kill -9
```
