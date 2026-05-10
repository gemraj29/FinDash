# FinDash

**Real-time portfolio tracker** with P&L analytics, FIFO tax-lot accounting, and CSV export.

Built on the **fintech** CodeDNA archetype: NestJS + PostgreSQL + Redis + Kafka + Next.js 14.

---

## Features

- **Real-time P&L** — unrealized and realized gain/loss updated live via WebSocket
- **FIFO Tax-Lot Accounting** — automatic lot allocation on every trade, holding period tracking
- **Multi-Portfolio** — manage multiple portfolios with independent positions
- **CSV Export** — download trade history or tax lots as spreadsheet-ready CSV
- **Append-Only Trade Log** — every trade is immutable; full audit trail
- **Double-Entry Ledger** — every debit has a matching credit entry
- **Idempotency** — duplicate trade submissions safely rejected

---

## Quick Start

### 1. Prerequisites

- Node.js 20+, Yarn 1.22+
- Docker & Docker Compose

### 2. Clone and install

```bash
git clone <repo>
cd findash
cp .env.example .env
yarn install
```

### 3. Start infrastructure

```bash
yarn docker:up   # starts PostgreSQL, Redis, Kafka, Zookeeper
```

### 4. Run database migrations

```bash
yarn db:migrate
```

### 5. Start dev servers

```bash
yarn dev
# API:  http://localhost:3001
# Web:  http://localhost:3000
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://...` | PostgreSQL connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker address(es) |
| `KAFKA_TOPIC_PRICE_UPDATES` | `findash.price-updates` | Kafka topic for price events |
| `JWT_SECRET` | — | **Required** in production |
| `JWT_EXPIRES_IN` | `7d` | JWT token lifetime |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | API base URL for frontend |
| `NEXT_PUBLIC_WS_URL` | `http://localhost:3001` | WebSocket URL for market data |

---

## Project Structure

```
findash/
├── apps/
│   ├── api/          # NestJS backend (port 3001)
│   │   ├── prisma/   # Database schema + migrations
│   │   └── src/
│   │       ├── common/          # PrismaService, RedisService, JWT auth
│   │       └── modules/
│   │           ├── portfolio/   # Portfolio CRUD + trade recording
│   │           ├── tax-lot/     # FIFO lot allocation + cost basis
│   │           ├── pnl/         # Unrealized + realized P&L
│   │           ├── market-data/ # Kafka consumer + WebSocket gateway
│   │           └── csv-export/  # CSV generation endpoints
│   └── web/          # Next.js 14 frontend (port 3000)
│       └── src/
│           ├── app/dashboard/   # Route pages (overview, positions, tax-lots, trades, export)
│           ├── components/      # UI components per feature
│           ├── hooks/           # SWR data hooks
│           └── lib/             # API client + formatting utilities
└── packages/
    └── shared/       # Shared TypeScript types (Portfolio, Trade, TaxLot, etc.)
```

---

## Running Tests

```bash
cd apps/api
yarn test              # run all Jest unit tests
yarn test --coverage   # with coverage report
```

---

## API Reference

See [API_CONTRACT.md](./API_CONTRACT.md) for full endpoint documentation.

Key endpoints:
- `GET /portfolios` — list portfolios
- `POST /portfolios/:id/trades` — record a trade (requires `Idempotency-Key` header)
- `GET /portfolios/:id/pnl/unrealized` — live P&L
- `GET /portfolios/:id/export/trades` — download CSV
- WebSocket `/market` — subscribe to `price:update` events

---

## Architecture Notes

### FIFO Tax-Lot Accounting

Every BUY trade opens a new tax lot. Every SELL trade consumes the oldest open lots first (First In, First Out). The `tax_lots` table is append-only — closed lots are stamped with `closedAt` and `holdingPeriod` but never deleted.

### Financial Data Integrity

- All monetary amounts are stored as **integers in cents** — no floating-point arithmetic
- All mutations run inside **PostgreSQL transactions**
- Every mutating API call requires an **Idempotency-Key** header
- Trades are recorded in an **append-only** `trades` table

### Real-Time Prices

Market data flows: `External feed → Kafka → MarketDataService → Redis cache (5s TTL) → WebSocket → Browser`. If Redis misses, the system falls back to the latest `price_snapshots` DB row.
