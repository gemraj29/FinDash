import { Injectable, Logger } from '@nestjs/common';
import { stringify } from 'csv-stringify/sync';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AppError,
  ErrorCodes,
  CsvExportOptions,
  ExportFormat,
  TradeFilter,
} from '@findash/shared';

/**
 * CsvExportService — generates downloadable CSV exports.
 *
 * Exports:
 *   - Trades: date, symbol, direction, shares, price, commission, notional, idempotency key
 *   - Tax Lots: lot id, symbol, opened, closed, shares acquired/remaining, cost basis, holding period
 *
 * DNA rule: amounts in cents (raw integers) exported; frontend formats for display.
 */
@Injectable()
export class CsvExportService {
  private readonly logger = new Logger(CsvExportService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Export trades for a portfolio as a CSV Buffer.
   * @returns Buffer containing UTF-8 CSV content
   */
  async exportTrades(portfolioId: string, filters?: TradeFilter): Promise<Buffer> {
    try {
      const trades = await this.prisma.trade.findMany({
        where: {
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
        },
        orderBy: { executedAt: 'asc' },
        take: filters?.limit ?? 10000,
      });

      const rows = trades.map((t) => ({
        trade_id: t.id,
        executed_at: t.executedAt.toISOString(),
        symbol: t.symbol,
        direction: t.direction,
        shares: t.shares.toNumber(),
        price_per_share_cents: t.pricePerShareCents,
        price_per_share_usd: (t.pricePerShareCents / 100).toFixed(4),
        commission_cents: t.commissionCents,
        commission_usd: (t.commissionCents / 100).toFixed(2),
        notional_cents: t.notionalCents,
        notional_usd: (t.notionalCents / 100).toFixed(2),
        idempotency_key: t.idempotencyKey,
      }));

      const csv = stringify(rows, {
        header: true,
        columns: [
          { key: 'trade_id', header: 'Trade ID' },
          { key: 'executed_at', header: 'Executed At (UTC)' },
          { key: 'symbol', header: 'Symbol' },
          { key: 'direction', header: 'Direction' },
          { key: 'shares', header: 'Shares' },
          { key: 'price_per_share_cents', header: 'Price (cents)' },
          { key: 'price_per_share_usd', header: 'Price (USD)' },
          { key: 'commission_cents', header: 'Commission (cents)' },
          { key: 'commission_usd', header: 'Commission (USD)' },
          { key: 'notional_cents', header: 'Notional (cents)' },
          { key: 'notional_usd', header: 'Notional (USD)' },
          { key: 'idempotency_key', header: 'Idempotency Key' },
        ],
      });

      this.logger.log(`Exported ${trades.length} trades for portfolio ${portfolioId}`);
      return Buffer.from(csv, 'utf-8');
    } catch (err) {
      this.logger.error(`Trade export failed for portfolio ${portfolioId}`, err);
      throw new AppError(ErrorCodes.EXPORT_FAILED, 'Failed to generate trades CSV', 500);
    }
  }

  /**
   * Export FIFO tax lots for a portfolio as a CSV Buffer.
   * Includes both open and closed lots.
   */
  async exportTaxLots(portfolioId: string): Promise<Buffer> {
    try {
      const lots = await this.prisma.taxLot.findMany({
        where: { portfolioId },
        orderBy: [{ symbol: 'asc' }, { acquiredAt: 'asc' }],
      });

      const rows = lots.map((l) => ({
        lot_id: l.id,
        symbol: l.symbol,
        acquired_at: l.acquiredAt.toISOString(),
        closed_at: l.closedAt?.toISOString() ?? '',
        shares_acquired: l.sharesAcquired.toNumber(),
        shares_remaining: l.sharesRemaining.toNumber(),
        cost_basis_per_share_cents: l.costBasisPerShareCents,
        cost_basis_per_share_usd: (l.costBasisPerShareCents / 100).toFixed(4),
        total_cost_cents: Math.round(l.sharesAcquired.toNumber() * l.costBasisPerShareCents),
        total_cost_usd: ((l.sharesAcquired.toNumber() * l.costBasisPerShareCents) / 100).toFixed(2),
        holding_period: l.holdingPeriod ?? '',
        status: l.closedAt ? 'CLOSED' : 'OPEN',
      }));

      const csv = stringify(rows, {
        header: true,
        columns: [
          { key: 'lot_id', header: 'Lot ID' },
          { key: 'symbol', header: 'Symbol' },
          { key: 'acquired_at', header: 'Acquired At (UTC)' },
          { key: 'closed_at', header: 'Closed At (UTC)' },
          { key: 'shares_acquired', header: 'Shares Acquired' },
          { key: 'shares_remaining', header: 'Shares Remaining' },
          { key: 'cost_basis_per_share_cents', header: 'Cost Basis/Share (cents)' },
          { key: 'cost_basis_per_share_usd', header: 'Cost Basis/Share (USD)' },
          { key: 'total_cost_cents', header: 'Total Cost (cents)' },
          { key: 'total_cost_usd', header: 'Total Cost (USD)' },
          { key: 'holding_period', header: 'Holding Period' },
          { key: 'status', header: 'Status' },
        ],
      });

      this.logger.log(`Exported ${lots.length} tax lots for portfolio ${portfolioId}`);
      return Buffer.from(csv, 'utf-8');
    } catch (err) {
      this.logger.error(`Tax lot export failed for portfolio ${portfolioId}`, err);
      throw new AppError(ErrorCodes.EXPORT_FAILED, 'Failed to generate tax lots CSV', 500);
    }
  }
}
