/**
 * PnlService — Jest unit tests
 * Uses mock PrismaService and RedisService.
 * Covers: unrealized P&L (cache hit, fallback), realized P&L, zero-position case.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { PnlService } from '../pnl.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { RedisService } from '../../../common/redis/redis.service';
import { Prisma } from '@prisma/client';
import { Quote } from '@findash/shared';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePosition(overrides: Partial<{
  id: string;
  portfolioId: string;
  symbol: string;
  sharesHeld: number;
  avgCostBasisCents: number;
}> = {}) {
  return {
    id: overrides.id ?? 'pos-001',
    portfolioId: overrides.portfolioId ?? 'port-001',
    symbol: overrides.symbol ?? 'AAPL',
    sharesHeld: new Prisma.Decimal(overrides.sharesHeld ?? 100),
    avgCostBasisCents: overrides.avgCostBasisCents ?? 15000, // $150.00
  };
}

function makeQuote(symbol: string, lastPriceCents: number, prevCloseCents: number): Quote {
  return {
    symbol,
    lastPriceCents,
    prevCloseCents,
    changeCents: lastPriceCents - prevCloseCents,
    changeBps: Math.round(((lastPriceCents - prevCloseCents) / prevCloseCents) * 10000),
    bidCents: lastPriceCents,
    askCents: lastPriceCents,
    volume: 1000,
    timestamp: new Date(),
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PnlService', () => {
  let service: PnlService;
  let prismaMock: jest.Mocked<PrismaService>;
  let redisMock: jest.Mocked<Partial<RedisService>>;

  beforeEach(async () => {
    prismaMock = {
      position: { findMany: jest.fn() },
      priceSnapshot: { findFirst: jest.fn() },
      trade: { findMany: jest.fn() },
      taxLot: { findMany: jest.fn() },
    } as any;

    redisMock = {
      getQuote: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PnlService,
        { provide: PrismaService, useValue: prismaMock },
        { provide: RedisService, useValue: redisMock },
      ],
    }).compile();

    service = module.get<PnlService>(PnlService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── calculateUnrealizedPnl ───────────────────────────────────────────────

  describe('calculateUnrealizedPnl', () => {
    it('returns zero PnL summary when portfolio has no positions', async () => {
      prismaMock.position.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.calculateUnrealizedPnl('port-001');

      expect(result.marketValueCents).toBe(0);
      expect(result.unrealizedPnlCents).toBe(0);
      expect(result.unrealizedPnlBps).toBe(0);
    });

    it('calculates unrealized P&L using Redis-cached quote (cache hit)', async () => {
      const position = makePosition({ sharesHeld: 100, avgCostBasisCents: 15000 });
      prismaMock.position.findMany = jest.fn().mockResolvedValue([position]);

      const quote = makeQuote('AAPL', 18000, 17500); // $180, prev close $175
      redisMock.getQuote = jest.fn().mockResolvedValue(JSON.stringify(quote));

      const result = await service.calculateUnrealizedPnl('port-001');

      // marketValue = 100 × 18000 = 1,800,000¢
      expect(result.marketValueCents).toBe(1_800_000);
      // costBasis = 100 × 15000 = 1,500,000¢
      expect(result.costBasisCents).toBe(1_500_000);
      // unrealized = 1,800,000 - 1,500,000 = 300,000¢ = $3,000
      expect(result.unrealizedPnlCents).toBe(300_000);
      // bps = 300000/1500000 × 10000 = 2000 bps = 20%
      expect(result.unrealizedPnlBps).toBe(2000);
    });

    it('falls back to DB price snapshot on Redis cache miss', async () => {
      const position = makePosition({ sharesHeld: 50, avgCostBasisCents: 20000 });
      prismaMock.position.findMany = jest.fn().mockResolvedValue([position]);
      redisMock.getQuote = jest.fn().mockResolvedValue(null); // cache miss

      prismaMock.priceSnapshot.findFirst = jest.fn().mockResolvedValue({
        symbol: 'AAPL',
        priceCents: 22000,
        prevCloseCents: 21000,
        capturedAt: new Date(),
      });

      const result = await service.calculateUnrealizedPnl('port-001');

      // marketValue = 50 × 22000 = 1,100,000¢
      expect(result.marketValueCents).toBe(1_100_000);
      // costBasis = 50 × 20000 = 1,000,000¢
      expect(result.costBasisCents).toBe(1_000_000);
      // unrealized = 100,000¢
      expect(result.unrealizedPnlCents).toBe(100_000);
    });

    it('calculates day change correctly', async () => {
      const position = makePosition({ sharesHeld: 200, avgCostBasisCents: 10000 });
      prismaMock.position.findMany = jest.fn().mockResolvedValue([position]);

      // Price went from $100 to $105 — change +500¢/share
      const quote = makeQuote('AAPL', 10500, 10000);
      redisMock.getQuote = jest.fn().mockResolvedValue(JSON.stringify(quote));

      const result = await service.calculateUnrealizedPnl('port-001');

      // dayChange = 200 × 500 = 100,000¢ = $1,000
      expect(result.dayChangeCents).toBe(100_000);
      // dayChangeBps = 100000/2100000 × 10000 ≈ 476 bps
      expect(result.dayChangeBps).toBeDefined();
    });

    it('handles negative unrealized P&L (loss position)', async () => {
      const position = makePosition({ sharesHeld: 100, avgCostBasisCents: 20000 }); // bought at $200
      prismaMock.position.findMany = jest.fn().mockResolvedValue([position]);

      const quote = makeQuote('AAPL', 17000, 17500); // now $170 — down from cost
      redisMock.getQuote = jest.fn().mockResolvedValue(JSON.stringify(quote));

      const result = await service.calculateUnrealizedPnl('port-001');

      // unrealized = 100 × (17000 - 20000) = -300,000¢
      expect(result.unrealizedPnlCents).toBe(-300_000);
      expect(result.unrealizedPnlBps).toBeLessThan(0);
    });
  });

  // ─── calculateRealizedPnl ─────────────────────────────────────────────────

  describe('calculateRealizedPnl', () => {
    it('returns zero realized P&L when no SELL trades in date range', async () => {
      prismaMock.trade.findMany = jest.fn().mockResolvedValue([]);
      prismaMock.taxLot.findMany = jest.fn().mockResolvedValue([]);

      const result = await service.calculateRealizedPnl('port-001', {
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
      });

      expect(result.realizedPnlCents).toBe(0);
    });

    it('calculates realized P&L from sell trades', async () => {
      // SELL 50 shares at $200 = $10,000 proceeds (minus $5 commission = $9,995)
      prismaMock.trade.findMany = jest.fn().mockResolvedValue([
        {
          id: 'trade-001',
          symbol: 'AAPL',
          direction: 'SELL',
          shares: new Prisma.Decimal(50),
          pricePerShareCents: 20000,
          commissionCents: 500,
          executedAt: new Date('2024-06-15'),
        },
      ]);

      // Tax lot: bought at $150/share
      prismaMock.taxLot.findMany = jest.fn().mockResolvedValue([
        {
          symbol: 'AAPL',
          sharesAcquired: new Prisma.Decimal(50),
          costBasisPerShareCents: 15000,
          closedAt: new Date('2024-06-15'),
        },
      ]);

      const result = await service.calculateRealizedPnl('port-001', {
        fromDate: new Date('2024-01-01'),
        toDate: new Date('2024-12-31'),
      });

      // proceeds = 50 × 20000 - 500 = 999,500¢
      // cost = 50 × 15000 = 750,000¢
      // realized = 999,500 - 750,000 = 249,500¢ = $2,495
      expect(result.realizedPnlCents).toBe(249_500);
    });
  });
});
