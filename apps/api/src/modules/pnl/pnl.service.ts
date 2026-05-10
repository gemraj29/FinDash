import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RedisService } from '../../common/redis/redis.service';
import {
  AppError,
  ErrorCodes,
  PnLSummary,
  DateRange,
  Quote,
} from '@findash/shared';

/**
 * PnLService — calculates unrealized and realized P&L for a portfolio.
 *
 * DNA rules:
 *  - All amounts in cents (integers)
 *  - Basis points (bps) for percentage returns (1 bps = 0.01%)
 *  - Reads live prices from Redis cache (set by MarketDataService)
 *  - Falls back to last PriceSnapshot if Redis miss
 */
@Injectable()
export class PnlService {
  private readonly logger = new Logger(PnlService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /**
   * Calculate unrealized P&L for all open positions in a portfolio.
   * Unrealized = (currentPrice - avgCostBasis) × sharesHeld, per position.
   */
  async calculateUnrealizedPnl(portfolioId: string): Promise<PnLSummary> {
    const positions = await this.prisma.position.findMany({
      where: { portfolioId, sharesHeld: { gt: 0 } },
    });

    if (!positions.length) {
      return this.zeroPnl(portfolioId);
    }

    let totalMarketValueCents = 0;
    let totalCostBasisCents = 0;
    let totalDayChangeCents = 0;
    let totalDayChangeBps = 0;

    for (const pos of positions) {
      const quote = await this.resolveQuote(pos.symbol);
      if (!quote) {
        this.logger.warn(`No quote for ${pos.symbol} — skipping in P&L calculation`);
        continue;
      }

      const sharesHeld = pos.sharesHeld.toNumber();
      const marketValueCents = Math.round(sharesHeld * quote.lastPriceCents);
      const costBasisCents = Math.round(sharesHeld * pos.avgCostBasisCents);
      const dayChangeCents = Math.round(sharesHeld * quote.changeCents);

      totalMarketValueCents += marketValueCents;
      totalCostBasisCents += costBasisCents;
      totalDayChangeCents += dayChangeCents;
    }

    const unrealizedPnlCents = totalMarketValueCents - totalCostBasisCents;
    const unrealizedPnlBps =
      totalCostBasisCents > 0
        ? Math.round((unrealizedPnlCents / totalCostBasisCents) * 10000)
        : 0;
    const dayChangeBps =
      totalMarketValueCents > 0
        ? Math.round((totalDayChangeCents / totalMarketValueCents) * 10000)
        : 0;

    return {
      portfolioId,
      marketValueCents: totalMarketValueCents,
      costBasisCents: totalCostBasisCents,
      unrealizedPnlCents,
      unrealizedPnlBps,
      realizedPnlCents: 0, // use calculateRealizedPnl for this
      dayChangeCents: totalDayChangeCents,
      dayChangeBps,
      calculatedAt: new Date(),
    };
  }

  /**
   * Calculate realized P&L for closed lots within a date range.
   * Realized P&L = (sell price - cost basis) × shares sold, per closed lot.
   */
  async calculateRealizedPnl(portfolioId: string, dateRange: DateRange): Promise<PnLSummary> {
    // Fetch all SELL trades in the date range
    const sellTrades = await this.prisma.trade.findMany({
      where: {
        portfolioId,
        direction: 'SELL',
        executedAt: {
          gte: dateRange.fromDate,
          lte: dateRange.toDate,
        },
      },
    });

    // For realized P&L we compute: (sell price - avg cost at time of sell) × shares
    // We approximate cost basis from closed tax lots in the same window
    const closedLots = await this.prisma.taxLot.findMany({
      where: {
        portfolioId,
        closedAt: {
          gte: dateRange.fromDate,
          lte: dateRange.toDate,
        },
      },
    });

    let realizedPnlCents = 0;

    for (const trade of sellTrades) {
      // Match sell trade to closed lots for the same symbol in the window
      const matchingLots = closedLots.filter((l) => l.symbol === trade.symbol);
      const totalCostForSell = matchingLots.reduce(
        (sum, lot) => sum + lot.sharesAcquired.toNumber() * lot.costBasisPerShareCents,
        0,
      );
      const sellProceeds =
        trade.shares.toNumber() * trade.pricePerShareCents - trade.commissionCents;
      realizedPnlCents += sellProceeds - totalCostForSell;
    }

    return {
      portfolioId,
      marketValueCents: 0,
      costBasisCents: 0,
      unrealizedPnlCents: 0,
      unrealizedPnlBps: 0,
      realizedPnlCents: Math.round(realizedPnlCents),
      dayChangeCents: 0,
      dayChangeBps: 0,
      calculatedAt: new Date(),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Resolve a price quote: try Redis cache first, then DB snapshot */
  private async resolveQuote(symbol: string): Promise<Quote | null> {
    const cached = await this.redis.getQuote(symbol);
    if (cached) {
      try {
        return JSON.parse(cached) as Quote;
      } catch {
        this.logger.warn(`Malformed cached quote for ${symbol}`);
      }
    }

    // Fallback: latest DB snapshot
    const snapshot = await this.prisma.priceSnapshot.findFirst({
      where: { symbol },
      orderBy: { capturedAt: 'desc' },
    });

    if (!snapshot) return null;

    return {
      symbol,
      lastPriceCents: snapshot.priceCents,
      prevCloseCents: snapshot.prevCloseCents,
      changeCents: snapshot.priceCents - snapshot.prevCloseCents,
      changeBps: Math.round(
        ((snapshot.priceCents - snapshot.prevCloseCents) / snapshot.prevCloseCents) * 10000,
      ),
      bidCents: snapshot.priceCents,
      askCents: snapshot.priceCents,
      volume: 0,
      timestamp: snapshot.capturedAt,
    };
  }

  private zeroPnl(portfolioId: string): PnLSummary {
    return {
      portfolioId,
      marketValueCents: 0,
      costBasisCents: 0,
      unrealizedPnlCents: 0,
      unrealizedPnlBps: 0,
      realizedPnlCents: 0,
      dayChangeCents: 0,
      dayChangeBps: 0,
      calculatedAt: new Date(),
    };
  }
}
