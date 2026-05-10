# FinDash — System Architecture

## Overview

FinDash is a **real-time portfolio tracker** built on the fintech CodeDNA archetype. It follows a strict layered architecture — every financial operation is transactional, append-only, and cent-accurate.

---

## High-Level System Architecture

```mermaid
graph TB
    subgraph Browser["🌐 Browser (localhost:3000)"]
        UI["Next.js 14 Dashboard"]
        SWR["SWR Data Fetching"]
        WS_CLIENT["Socket.io Client"]
    end

    subgraph API["⚙️ NestJS API (localhost:3001)"]
        direction TB
        CTRL["REST Controllers"]
        SVC["Service Layer"]
        GATEWAY["WebSocket Gateway\n/market namespace"]
        MIDDLEWARE["Idempotency\nMiddleware"]
        FILTER["AppException\nFilter"]
    end

    subgraph DB["🗄️ Data Layer"]
        PG["PostgreSQL 16\n(Prisma ORM)"]
        REDIS["Redis 7\n(5s TTL quotes)"]
        KAFKA["Kafka\n(price-updates topic)"]
    end

    subgraph External["📡 External"]
        FEED["Market Data Feed\n(price producer)"]
    end

    UI -->|"HTTP REST"| CTRL
    WS_CLIENT -->|"WebSocket"| GATEWAY
    SWR -->|"polling 10-30s"| CTRL
    CTRL --> MIDDLEWARE
    MIDDLEWARE --> SVC
    SVC --> PG
    SVC --> REDIS
    GATEWAY --> REDIS
    KAFKA -->|"findash.price-updates"| SVC
    FEED --> KAFKA
    FILTER -->|"structured errors"| CTRL

    style Browser fill:#18181b,color:#e4e4e7
    style API fill:#1c1917,color:#e4e4e7
    style DB fill:#14532d,color:#e4e4e7
    style External fill:#1e1b4b,color:#e4e4e7
```

---

## Request Lifecycle

```mermaid
sequenceDiagram
    participant Browser
    participant Middleware
    participant Controller
    participant Service
    participant Prisma
    participant Redis

    Browser->>Middleware: POST /portfolios/:id/trades<br/>Idempotency-Key: uuid
    Middleware->>Redis: GET idempotency:uuid
    alt Duplicate request
        Redis-->>Middleware: HIT
        Middleware-->>Browser: 409 Conflict
    else New request
        Redis-->>Middleware: MISS
        Middleware->>Redis: SET idempotency:uuid (30s TTL)
        Middleware->>Controller: forward request
        Controller->>Service: addTrade(dto)
        Service->>Prisma: $transaction([<br/>  check idempotency,<br/>  upsert position,<br/>  create trade,<br/>  allocate FIFO lots,<br/>  write ledger entry<br/>])
        Prisma-->>Service: Trade record
        Service-->>Controller: Trade
        Controller-->>Browser: 201 Created
    end
```

---

## Module Dependency Graph

```mermaid
graph LR
    APP["AppModule"]
    APP --> PRISMA["PrismaModule\n(global)"]
    APP --> REDIS["RedisModule\n(global)"]
    APP --> AUTH["AuthModule"]
    APP --> PORT["PortfolioModule"]
    APP --> TAX["TaxLotModule"]
    APP --> PNL["PnlModule"]
    APP --> MKT["MarketDataModule"]
    APP --> CSV["CsvExportModule"]

    PORT --> PRISMA
    PORT --> TAX
    TAX --> PRISMA
    PNL --> PRISMA
    PNL --> REDIS
    MKT --> REDIS
    CSV --> PRISMA

    style APP fill:#22c55e,color:#000
    style PRISMA fill:#3b82f6,color:#fff
    style REDIS fill:#ef4444,color:#fff
```

---

## Real-Time Price Data Flow

```mermaid
flowchart LR
    FEED["📡 External\nPrice Feed"] -->|"Kafka produce"| TOPIC["Kafka Topic\nfindash.price-updates"]
    TOPIC -->|"consume"| MDS["MarketDataService\nonPriceUpdate()"]
    MDS -->|"setQuote() 5s TTL"| REDIS[("Redis\nprice:{symbol}")]
    MDS -->|"broadcast"| GW["WebSocket Gateway\n/market"]
    GW -->|"price:update event"| BROWSER["🌐 Browser\npositions table"]
    
    PNL["PnlService\ncalculateUnrealizedPnl()"] -->|"getQuote()"| REDIS
    PNL -->|"fallback"| DB[("PostgreSQL\nprice_snapshots")]

    style FEED fill:#1e1b4b,color:#e4e4e7
    style REDIS fill:#ef4444,color:#fff
    style DB fill:#14532d,color:#fff
```
