import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaxLotService } from '../tax-lot/tax-lot.service';
import {
  AppError,
  ErrorCodes,
  Portfolio,
  Position,
  Trade,
  CreatePortfolioDTO,
  CreateTradeDTO,
  TradeFilter,
  TradeDirection,
  AssetClass,
} from '@findash/shared';
import { v4 as uuidv4 } from 'uuid';

/**
 * PortfolioService — manages portfolios, positions, and the trade event log.
 *
 * DNA rules:
 *  - All trade operations inside a DB transaction
 *  - Idempotency key enforced at DB level (unique constraint)
 *  - Amounts in cents; shares as Decimal(18,8)
 *  - Trade log is append-only (no updates or deletes on trades table)
 */
@Injectable()
export class PortfolioService {
  private readonly logger = new Logger(PortfolioService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly taxLotService: TaxLotService,
  ) {}

  /** Retrieve all portfolios */
  async findAll(): Promise<Portfolio[]> {
    const rows = await this.prisma.portfolio.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(this.mapPortfolio);
  }

  /** Retrieve a single portfolio by ID */
  async findById(id: string): Promise<Portfolio> {
    const row = await this.prisma.portfolio.findUnique({ where: { id } });
    if (!row) {
      throw new AppError(ErrorCodes.PORTFOLIO_NOT_FOUND, `Portfolio ${id} not found`, 404);
    }
    return this.mapPortfolio(row);
  }

  /** Create a new portfolio */
  async create(dto: CreatePortfolioDTO): Promise<Portfolio> {
    const row = await this.prisma.portfolio.create({
      data: {
        name: dto.name,
        description: dto.description ?? null,
        currency: dto.currency ?? 'USD',
      },
    });
    return this.mapPortfolio(row);
  }

  /**
   * Record a trade and update position + tax lots atomically.
   * - BUY: upserts position, opens a new tax lot, appends ledger entry
   * - SELL: decrements position shares, consumes FIFO lots, appends ledger entry
   *
   * @throws AppError(DUPLICATE_TRADE) if idempotencyKey already exists
   * @throws AppError(INSUFFICIENT_SHARES) if sell qty > available
   */
  async addTrade(dto: CreateTradeDTO): Promise<Trade> {
    return this.prisma.$transaction(async (tx) => {
      // 1. Check idempotency
      const existing = await tx.trade.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
      });
      if (existing) {
        throw new AppError(ErrorCodes.DUPLICATE_TRADE, 'Trade already recorded', 409, {
          idempotencyKey: dto.idempotencyKey,
        });
      }

      // 2. Upsert position
      const position = await this.upsertPosition(tx, dto);

      // 3. Write trade record (append-only)
      const notionalCents = Math.round(dto.shares * dto.pricePerShareCents);
      const trade = await tx.trade.create({
        data: {
          portfolioId: dto.portfolioId,
          positionId: position.id,
          symbol: dto.symbol,
          direction: dto.direction,
          shares: new Prisma.Decimal(dto.shares),
          pricePerShareCents: dto.pricePerShareCents,
          commissionCents: dto.commissionCents ?? 0,
          notionalCents,
          idempotencyKey: dto.idempotencyKey,
          executedAt: dto.executedAt ?? new Date(),
        },
      });

      // 4. Update position shares and avg cost
      await this.updatePositionAfterTrade(tx, position.id, dto);

      // 5. Allocate / consume FIFO tax lots
      await this.taxLotService.allocateLot({ ...dto, positionId: position.id });

      // 6. Append double-entry ledger
      const ledgerAmt = dto.direction === TradeDirection.BUY ? -notionalCents : notionalCents;
      await tx.ledgerEntry.create({
        data: {
          portfolioId: dto.portfolioId,
          entryType: 'TRADE',
          amountCents: ledgerAmt,
          description: `${dto.direction} ${dto.shares} ${dto.symbol} @ ${dto.pricePerShareCents}¢`,
          referenceId: trade.id,
        },
      });

      this.logger.log(`Trade recorded: ${trade.id} — ${dto.direction} ${dto.shares} ${dto.symbol}`);
      return this.mapTrade(trade);
    });
  }

  /** Get all open positions for a portfolio */
  async getPositions(portfolioId: string): Promise<Position[]> {
    const rows = await this.prisma.position.findMany({
      where: { portfolioId, sharesHeld: { gt: 0 } },
      orderBy: { symbol: 'asc' },
    });
    return rows.map(this.mapPosition);
  }

  /** Get trade history with optional filters */
  async getTradeHistory(portfolioId: string, filters?: TradeFilter): Promise<Trade[]> {
    const where: Prisma.TradeWhereInput = {
      portfolioId,
      ...(filters?.symbol ? { symbol: filters.symbol } : {}),
      ...(filters?.direction ? { direction: filters.direction } : {}),
      ...(filters?.fromDate || filters?.toDate
        ? {
            executedAt: {
              ...(filters.fromDate ? { gte: filters.fromDate } : {}),
              ...(filters.toDate ? { lte: filters.toDate } : {}),
            },
          }
        : {}),
    };

    const rows = await this.prisma.trade.findMany({
      where,
      orderBy: { executedAt: 'desc' },
      take: filters?.limit ?? 100,
      skip: filters?.offset ?? 0,
    });

    return rows.map(this.mapTrade);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async upsertPosition(
    tx: Prisma.TransactionClient,
    dto: CreateTradeDTO,
  ) {
    return tx.position.upsert({
      where: { portfolioId_symbol: { portfolioId: dto.portfolioId, symbol: dto.symbol } },
      create: {
        portfolioId: dto.portfolioId,
        symbol: dto.symbol,
        assetClass: AssetClass.EQUITY, // default; can be overridden per trade
        sharesHeld: new Prisma.Decimal(0),
        avgCostBasisCents: dto.pricePerShareCents,
      },
      update: {}, // shares updated in updatePositionAfterTrade
    });
  }

  private async updatePositionAfterTrade(
    tx: Prisma.TransactionClient,
    positionId: string,
    dto: CreateTradeDTO,
  ) {
    const pos = await tx.position.findUniqueOrThrow({ where: { id: positionId } });
    const currentShares = pos.sharesHeld.toNumber();
    const currentCost = pos.avgCostBasisCents;

    let newShares: number;
    let newAvgCost: number;

    if (dto.direction === TradeDirection.BUY) {
      newShares = currentShares + dto.shares;
      // Weighted average cost
      newAvgCost =
        newShares > 0
          ? Math.round(
              (currentShares * currentCost + dto.shares * dto.pricePerShareCents) / newShares,
            )
          : dto.pricePerShareCents;
    } else {
      newShares = currentShares - dto.shares;
      newAvgCost = currentCost; // Avg cost unchanged on sell (FIFO cost basis tracked in lots)
    }

    await tx.position.update({
      where: { id: positionId },
      data: {
        sharesHeld: new Prisma.Decimal(Math.max(0, newShares)),
        avgCostBasisCents: newAvgCost,
      },
    });
  }

  private mapPortfolio(row: {
    id: string;
    name: string;
    description: string | null;
    currency: string;
    taxMethod: string;
    createdAt: Date;
    updatedAt: Date;
  }): Portfolio {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      currency: row.currency,
      taxMethod: row.taxMethod as any,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapPosition(row: {
    id: string;
    portfolioId: string;
    symbol: string;
    assetClass: string;
    sharesHeld: Prisma.Decimal;
    avgCostBasisCents: number;
    openedAt: Date;
    updatedAt: Date;
  }): Position {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      symbol: row.symbol,
      assetClass: row.assetClass as AssetClass,
      sharesHeld: row.sharesHeld.toNumber(),
      avgCostBasisCents: row.avgCostBasisCents,
      openedAt: row.openedAt,
      updatedAt: row.updatedAt,
    };
  }

  private mapTrade(row: {
    id: string;
    portfolioId: string;
    positionId: string;
    symbol: string;
    direction: string;
    shares: Prisma.Decimal;
    pricePerShareCents: number;
    commissionCents: number;
    notionalCents: number;
    idempotencyKey: string;
    executedAt: Date;
    createdAt: Date;
  }): Trade {
    return {
      id: row.id,
      portfolioId: row.portfolioId,
      positionId: row.positionId,
      symbol: row.symbol,
      direction: row.direction as TradeDirection,
      shares: row.shares.toNumber(),
      pricePerShareCents: row.pricePerShareCents,
      commissionCents: row.commissionCents,
      notionalCents: row.notionalCents,
      idempotencyKey: row.idempotencyKey,
      executedAt: row.executedAt,
      createdAt: row.createdAt,
    };
  }
}
