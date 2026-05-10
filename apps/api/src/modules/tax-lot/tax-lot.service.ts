import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AppError,
  ErrorCodes,
  CostBasis,
  TaxLot,
  HoldingPeriod,
  TradeDirection,
  CreateTradeDTO,
} from '@findash/shared';

/**
 * TaxLotService — FIFO cost-basis engine.
 *
 * DNA rules enforced:
 *  - All financial operations inside a DB transaction
 *  - Amounts stored as integers (cents)
 *  - FIFO: oldest lots are consumed first on SELL
 *  - Append-only: closed lots are never deleted, closedAt is stamped
 */
@Injectable()
export class TaxLotService {
  private readonly logger = new Logger(TaxLotService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Allocate a trade against existing tax lots (FIFO).
   * For BUY: creates a new open lot.
   * For SELL: consumes oldest open lots in FIFO order, stamps closedAt on exhausted lots.
   *
   * @returns The lot(s) affected by this trade
   * @throws AppError(INSUFFICIENT_SHARES) if sell qty exceeds available shares
   */
  async allocateLot(trade: CreateTradeDTO & { positionId: string }): Promise<TaxLot[]> {
    return this.prisma.$transaction(async (tx) => {
      if (trade.direction === TradeDirection.BUY) {
        return this.openLot(tx, trade);
      } else {
        return this.consumeLotsFilfo(tx, trade);
      }
    });
  }

  /**
   * Compute the full cost basis for a position.
   * Returns all open lots, weighted average cost, and total cost.
   */
  async computeCostBasis(positionId: string): Promise<CostBasis> {
    const position = await this.prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position) {
      throw new AppError(ErrorCodes.POSITION_NOT_FOUND, `Position ${positionId} not found`, 404);
    }

    const openLots = await this.prisma.taxLot.findMany({
      where: {
        positionId,
        closedAt: null,
        sharesRemaining: { gt: 0 },
      },
      orderBy: { acquiredAt: 'asc' },
    });

    const mapped: TaxLot[] = openLots.map((lot) => ({
      id: lot.id,
      positionId: lot.positionId,
      portfolioId: lot.portfolioId,
      symbol: lot.symbol,
      sharesAcquired: lot.sharesAcquired.toNumber(),
      sharesRemaining: lot.sharesRemaining.toNumber(),
      costBasisPerShareCents: lot.costBasisPerShareCents,
      acquiredAt: lot.acquiredAt,
      closedAt: lot.closedAt,
      holdingPeriod: lot.holdingPeriod as HoldingPeriod | null,
    }));

    const totalShares = mapped.reduce((sum, l) => sum + l.sharesRemaining, 0);
    const totalCostCents = mapped.reduce(
      (sum, l) => sum + l.sharesRemaining * l.costBasisPerShareCents,
      0,
    );
    const avgCostPerShareCents = totalShares > 0 ? Math.round(totalCostCents / totalShares) : 0;

    return {
      positionId,
      symbol: position.symbol,
      totalSharesHeld: totalShares,
      totalCostCents: Math.round(totalCostCents),
      avgCostPerShareCents,
      openLots: mapped,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Open a new lot for a BUY trade */
  private async openLot(
    tx: Prisma.TransactionClient,
    trade: CreateTradeDTO & { positionId: string },
  ): Promise<TaxLot[]> {
    const executedAt = trade.executedAt ?? new Date();

    const lot = await tx.taxLot.create({
      data: {
        positionId: trade.positionId,
        portfolioId: trade.portfolioId,
        symbol: trade.symbol,
        sharesAcquired: new Prisma.Decimal(trade.shares),
        sharesRemaining: new Prisma.Decimal(trade.shares),
        costBasisPerShareCents: trade.pricePerShareCents,
        acquiredAt: executedAt,
      },
    });

    this.logger.log(
      `Opened lot ${lot.id}: ${trade.shares} shares of ${trade.symbol} @ ${trade.pricePerShareCents}¢`,
    );

    return [this.mapLot(lot)];
  }

  /**
   * FIFO sell: consume oldest open lots first.
   * Partial consumption leaves the lot open with reduced sharesRemaining.
   */
  private async consumeLotsFilfo(
    tx: Prisma.TransactionClient,
    trade: CreateTradeDTO & { positionId: string },
  ): Promise<TaxLot[]> {
    const openLots = await tx.taxLot.findMany({
      where: {
        positionId: trade.positionId,
        closedAt: null,
        sharesRemaining: { gt: 0 },
      },
      orderBy: { acquiredAt: 'asc' }, // FIFO — oldest first
    });

    const totalAvailable = openLots.reduce(
      (sum, lot) => sum + lot.sharesRemaining.toNumber(),
      0,
    );

    if (trade.shares > totalAvailable) {
      throw new AppError(
        ErrorCodes.INSUFFICIENT_SHARES,
        `Cannot sell ${trade.shares} shares of ${trade.symbol}: only ${totalAvailable} available`,
        400,
        { available: totalAvailable, requested: trade.shares },
      );
    }

    const affectedLots: TaxLot[] = [];
    let remainingToSell = trade.shares;
    const executedAt = trade.executedAt ?? new Date();

    for (const lot of openLots) {
      if (remainingToSell <= 0) break;

      const lotShares = lot.sharesRemaining.toNumber();
      const sharesToClose = Math.min(lotShares, remainingToSell);
      const newRemaining = lotShares - sharesToClose;
      const isFullyClosed = newRemaining <= 0;

      const holdingPeriod = this.resolveHoldingPeriod(lot.acquiredAt, executedAt);

      const updated = await tx.taxLot.update({
        where: { id: lot.id },
        data: {
          sharesRemaining: new Prisma.Decimal(newRemaining),
          closedAt: isFullyClosed ? executedAt : null,
          holdingPeriod: isFullyClosed ? holdingPeriod : lot.holdingPeriod,
        },
      });

      affectedLots.push(this.mapLot(updated));
      remainingToSell -= sharesToClose;
    }

    this.logger.log(
      `FIFO sell: ${trade.shares} shares of ${trade.symbol} consumed ${affectedLots.length} lot(s)`,
    );

    return affectedLots;
  }

  /** Determine holding period from acquisition date to disposition date */
  private resolveHoldingPeriod(acquiredAt: Date, disposedAt: Date): HoldingPeriod {
    const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
    const held = disposedAt.getTime() - acquiredAt.getTime();
    return held >= msPerYear ? HoldingPeriod.LONG_TERM : HoldingPeriod.SHORT_TERM;
  }

  private mapLot(lot: {
    id: string;
    positionId: string;
    portfolioId: string;
    symbol: string;
    sharesAcquired: Prisma.Decimal;
    sharesRemaining: Prisma.Decimal;
    costBasisPerShareCents: number;
    acquiredAt: Date;
    closedAt: Date | null;
    holdingPeriod: string | null;
  }): TaxLot {
    return {
      id: lot.id,
      positionId: lot.positionId,
      portfolioId: lot.portfolioId,
      symbol: lot.symbol,
      sharesAcquired: lot.sharesAcquired.toNumber(),
      sharesRemaining: lot.sharesRemaining.toNumber(),
      costBasisPerShareCents: lot.costBasisPerShareCents,
      acquiredAt: lot.acquiredAt,
      closedAt: lot.closedAt,
      holdingPeriod: lot.holdingPeriod as HoldingPeriod | null,
    };
  }
}
