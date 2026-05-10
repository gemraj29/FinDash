/**
 * TaxLotService — Jest unit tests
 * Uses a mock PrismaService (no real DB required).
 * Covers: BUY opens lot, SELL partial FIFO, SELL full FIFO, insufficient shares.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { TaxLotService } from '../tax-lot.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { TradeDirection, HoldingPeriod } from '@findash/shared';
import { Prisma } from '@prisma/client';

// ─── Mock factory ─────────────────────────────────────────────────────────────

function makeDecimal(v: number): Prisma.Decimal {
  return new Prisma.Decimal(v);
}

function makeOpenLot(overrides: Partial<{
  id: string;
  positionId: string;
  portfolioId: string;
  symbol: string;
  sharesAcquired: number;
  sharesRemaining: number;
  costBasisPerShareCents: number;
  acquiredAt: Date;
  closedAt: Date | null;
  holdingPeriod: string | null;
}> = {}) {
  return {
    id: overrides.id ?? 'lot-001',
    positionId: overrides.positionId ?? 'pos-001',
    portfolioId: overrides.portfolioId ?? 'port-001',
    symbol: overrides.symbol ?? 'AAPL',
    sharesAcquired: makeDecimal(overrides.sharesAcquired ?? 100),
    sharesRemaining: makeDecimal(overrides.sharesRemaining ?? 100),
    costBasisPerShareCents: overrides.costBasisPerShareCents ?? 15000, // $150.00
    acquiredAt: overrides.acquiredAt ?? new Date('2023-01-15'),
    closedAt: overrides.closedAt ?? null,
    holdingPeriod: overrides.holdingPeriod ?? null,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('TaxLotService', () => {
  let service: TaxLotService;
  let prismaMock: jest.Mocked<PrismaService>;

  const txMock = {
    taxLot: {
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    position: {
      findUnique: jest.fn(),
    },
  };

  beforeEach(async () => {
    prismaMock = {
      $transaction: jest.fn((fn: (tx: any) => any) => fn(txMock)),
      taxLot: { findMany: jest.fn() },
      position: { findUnique: jest.fn() },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxLotService,
        { provide: PrismaService, useValue: prismaMock },
      ],
    }).compile();

    service = module.get<TaxLotService>(TaxLotService);
  });

  afterEach(() => jest.clearAllMocks());

  // ─── allocateLot — BUY ────────────────────────────────────────────────────

  describe('allocateLot — BUY', () => {
    it('opens a new tax lot with correct shares and cost basis', async () => {
      const newLot = makeOpenLot({ sharesAcquired: 50, sharesRemaining: 50, costBasisPerShareCents: 18000 });
      txMock.taxLot.create.mockResolvedValue(newLot);

      const result = await service.allocateLot({
        portfolioId: 'port-001',
        positionId: 'pos-001',
        symbol: 'AAPL',
        direction: TradeDirection.BUY,
        shares: 50,
        pricePerShareCents: 18000,
        idempotencyKey: 'idem-001',
      });

      expect(txMock.taxLot.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sharesAcquired: expect.any(Prisma.Decimal),
            sharesRemaining: expect.any(Prisma.Decimal),
            costBasisPerShareCents: 18000,
          }),
        }),
      );
      expect(result).toHaveLength(1);
      expect(result[0].sharesAcquired).toBe(50);
      expect(result[0].costBasisPerShareCents).toBe(18000);
    });
  });

  // ─── allocateLot — SELL (FIFO) ────────────────────────────────────────────

  describe('allocateLot — SELL (FIFO)', () => {
    it('fully closes a single lot when sell qty equals lot shares', async () => {
      const lot = makeOpenLot({ sharesRemaining: 100, acquiredAt: new Date('2020-01-01') });
      txMock.taxLot.findMany.mockResolvedValue([lot]);

      const closedLot = { ...lot, sharesRemaining: makeDecimal(0), closedAt: new Date(), holdingPeriod: 'LONG_TERM' };
      txMock.taxLot.update.mockResolvedValue(closedLot);

      const result = await service.allocateLot({
        portfolioId: 'port-001',
        positionId: 'pos-001',
        symbol: 'AAPL',
        direction: TradeDirection.SELL,
        shares: 100,
        pricePerShareCents: 20000,
        idempotencyKey: 'idem-002',
      });

      expect(txMock.taxLot.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            sharesRemaining: expect.any(Prisma.Decimal),
            closedAt: expect.any(Date),
            holdingPeriod: HoldingPeriod.LONG_TERM,
          }),
        }),
      );
      expect(result[0].sharesRemaining).toBe(0);
    });

    it('partially consumes oldest lot first (FIFO)', async () => {
      const lot1 = makeOpenLot({ id: 'lot-001', sharesRemaining: 100, acquiredAt: new Date('2022-01-01') });
      const lot2 = makeOpenLot({ id: 'lot-002', sharesRemaining: 50, acquiredAt: new Date('2023-06-01') });
      txMock.taxLot.findMany.mockResolvedValue([lot1, lot2]); // oldest first

      // Sell 60 shares — should consume all of lot1 (100→0... wait no, sell=60, lot1=100, so lot1 goes to 40)
      const updatedLot1 = { ...lot1, sharesRemaining: makeDecimal(40), closedAt: null };
      txMock.taxLot.update.mockResolvedValueOnce(updatedLot1);

      const result = await service.allocateLot({
        portfolioId: 'port-001',
        positionId: 'pos-001',
        symbol: 'AAPL',
        direction: TradeDirection.SELL,
        shares: 60,
        pricePerShareCents: 20000,
        idempotencyKey: 'idem-003',
      });

      // Only lot1 should be touched
      expect(txMock.taxLot.update).toHaveBeenCalledTimes(1);
      expect(txMock.taxLot.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lot-001' } }),
      );
    });

    it('spans multiple lots when sell qty exceeds first lot (FIFO)', async () => {
      const lot1 = makeOpenLot({ id: 'lot-001', sharesRemaining: 30, acquiredAt: new Date('2021-01-01') });
      const lot2 = makeOpenLot({ id: 'lot-002', sharesRemaining: 80, acquiredAt: new Date('2022-06-01') });
      txMock.taxLot.findMany.mockResolvedValue([lot1, lot2]);

      txMock.taxLot.update
        .mockResolvedValueOnce({ ...lot1, sharesRemaining: makeDecimal(0), closedAt: new Date() })
        .mockResolvedValueOnce({ ...lot2, sharesRemaining: makeDecimal(50), closedAt: null });

      await service.allocateLot({
        portfolioId: 'port-001',
        positionId: 'pos-001',
        symbol: 'AAPL',
        direction: TradeDirection.SELL,
        shares: 60, // 30 from lot1, 30 from lot2
        pricePerShareCents: 20000,
        idempotencyKey: 'idem-004',
      });

      expect(txMock.taxLot.update).toHaveBeenCalledTimes(2);
    });

    it('throws AppError(INSUFFICIENT_SHARES) when sell qty exceeds available', async () => {
      const lot = makeOpenLot({ sharesRemaining: 10 });
      txMock.taxLot.findMany.mockResolvedValue([lot]);

      await expect(
        service.allocateLot({
          portfolioId: 'port-001',
          positionId: 'pos-001',
          symbol: 'AAPL',
          direction: TradeDirection.SELL,
          shares: 50, // only 10 available
          pricePerShareCents: 20000,
          idempotencyKey: 'idem-005',
        }),
      ).rejects.toMatchObject({
        code: 'INSUFFICIENT_SHARES',
        message: expect.stringContaining('10'),
      });
    });
  });

  // ─── computeCostBasis ─────────────────────────────────────────────────────

  describe('computeCostBasis', () => {
    it('returns correct avg cost basis across multiple open lots', async () => {
      prismaMock.position.findUnique = jest.fn().mockResolvedValue({
        id: 'pos-001',
        symbol: 'AAPL',
      });

      prismaMock.taxLot.findMany = jest.fn().mockResolvedValue([
        makeOpenLot({ sharesRemaining: 100, costBasisPerShareCents: 15000 }),
        makeOpenLot({ sharesRemaining: 50, costBasisPerShareCents: 18000 }),
      ]);

      const result = await service.computeCostBasis('pos-001');

      // Weighted avg: (100×150 + 50×180) / 150 = (15000 + 9000) / 150 = 160
      expect(result.totalSharesHeld).toBe(150);
      expect(result.totalCostCents).toBe(24000 * 100); // 100×15000 + 50×18000
      expect(result.avgCostPerShareCents).toBe(16000); // $160.00
      expect(result.openLots).toHaveLength(2);
    });

    it('throws AppError(POSITION_NOT_FOUND) for unknown position', async () => {
      prismaMock.position.findUnique = jest.fn().mockResolvedValue(null);

      await expect(service.computeCostBasis('nonexistent')).rejects.toMatchObject({
        code: 'POSITION_NOT_FOUND',
      });
    });
  });
});
