# FinDash

**Real-time portfolio tracker** with P&L analytics, FIFO tax-lot accounting, and CSV export.

Built on the **fintech** CodeDNA archetype: NestJS + PostgreSQL + Redis + Kafka + Next.js 14.

---

## ▶ Quick Start (One Click)

**Double-click `FinDash.command`** in Finder — it handles everything:

1. Starts Docker Desktop if not open
2. Spins up PostgreSQL, Redis, Kafka
3. Builds shared TypeScript types
4. Runs database migrations
5. Seeds sample portfolio data (first run only)
6. Clears build cache, compiles API
7. Starts API (port 3001) + Web (port 3000)
8. Opens `http://localhost:3000` in your browser automatically

> **Prerequisite**: [Docker Desktop](https://www.docker.com/products/docker-desktop/) and Node.js 20+ must be installed.

---

## Command-Line Start (Advanced)

```bash
git clone https://github.com/gemraj29/FinDash.git
cd findash
cp .env.example .env
yarn install
yarn dev:start          # full startup sequence
```

To load sample data after first start:
```bash
yarn db:seed
```

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

## Project Structure

```
findash/
├── FinDash.command          ← Double-click to launch everything
├── apps/
│   ├── api/                 # NestJS backend (port 3001)
│   │   ├── prisma/          # Schema, migrations, seed data
│   │   └── src/
│   │       ├── common/      # PrismaService, RedisService, auth, middleware
│   │       └── modules/
│   │           ├── portfolio/   # Portfolio CRUD + trade recording
│   │           ├── tax-lot/     # FIFO lot allocation + cost basis
│   │           ├── pnl/         # Unrealized + realized P&L
│   │           ├── market-data/ # Kafka consumer + WebSocket gateway
│   │           └── csv-export/  # CSV generation endpoints
│   └── web/                 # Next.js 14 frontend (port 3000)
│       └── src/
│           ├── app/dashboard/   # Route pages
│           ├── components/      # UI components per feature
│           ├── hooks/           # SWR data hooks
│           └── lib/             # API client + formatting utilities
├── packages/
│   └── shared/              # Shared TypeScript types (Portfolio, Trade, TaxLot…)
└── scripts/
    └── dev.sh               # Full startup script (used by yarn dev:start)
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/findash` | PostgreSQL connection |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection |
| `KAFKA_BROKERS` | `localhost:9092` | Kafka broker(s) |
| `JWT_SECRET` | `change-me` | JWT signing secret (change in production) |
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | API base URL for frontend |

---

## Yarn Scripts

| Script | Description |
|--------|-------------|
| `yarn dev:start` | Full startup (Docker → migrate → seed → API + Web) |
| `yarn dev` | Start API + Web in parallel (assumes Docker is running) |
| `yarn shared:build` | Compile shared TypeScript types |
| `yarn db:seed` | Load sample portfolio data |
| `yarn db:migrate` | Run Prisma migrations (interactive) |
| `yarn docker:up` | Start Docker services |
| `yarn docker:down` | Stop Docker services |

---

## Running Tests

```bash
cd apps/api
yarn test              # run all Jest unit tests
yarn test --coverage   # with coverage report
```

---

## Documentation

| Doc | Contents |
|-----|----------|
| [API_CONTRACT.md](./API_CONTRACT.md) | All REST endpoints, WebSocket events, service signatures |
| [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) | System architecture diagrams, module graph, request lifecycle |
| [docs/DATA_MODEL.md](./docs/DATA_MODEL.md) | Entity relationship diagram, schema decisions, indexes |
| [docs/FLOWS.md](./docs/FLOWS.md) | FIFO logic flowchart, P&L calculation, trade recording sequence |
| [docs/USAGE.md](./docs/USAGE.md) | Page-by-page usage guide, trade API examples, troubleshooting |

## API Reference

See [API_CONTRACT.md](./API_CONTRACT.md) for full endpoint documentation.

Key endpoints:
- `GET /portfolios` — list portfolios
- `POST /portfolios/:id/trades` — record a trade (requires `Idempotency-Key` header)
- `GET /portfolios/:id/pnl/unrealized` — live P&L
- `GET /portfolios/:id/export/trades` — download trades as CSV
- WebSocket `/market` — subscribe to `price:update` events

> **Note**: Authentication is disabled in development mode. All endpoints are open.
> JWT auth can be re-enabled by adding `@UseGuards(JwtAuthGuard)` back to controllers.

---

## Architecture Notes

### FIFO Tax-Lot Accounting

Every BUY trade opens a new tax lot. Every SELL trade consumes the oldest open lots first (FIFO). The `tax_lots` table is append-only — closed lots are stamped with `closedAt` and `holdingPeriod` but never deleted.

### Financial Data Integrity

- All monetary amounts stored as **integers in cents** — no floating-point arithmetic
- All mutations run inside **PostgreSQL transactions**
- Every mutating API call requires an **Idempotency-Key** header
- Trades are recorded in an **append-only** `trades` table

### Real-Time Prices

Market data flows: `External feed → Kafka → MarketDataService → Redis cache (5s TTL) → WebSocket → Browser`

If Redis misses, the system falls back to the latest `price_snapshots` DB row.

### Monorepo TypeScript Setup

The shared package must be compiled before the API starts (`yarn shared:build`).
The API's `tsconfig.json` points to `packages/shared/dist/index.d.ts` for types,
and yarn workspace resolution handles runtime imports via `packages/shared/dist/index.js`.
