/**
 * FinDash — Shared Domain Types
 * All amounts are stored as integers (cents / basis points) to avoid floating-point errors.
 * Architecture: fintech · Pattern: Hexagonal · DNA: FinDash v0.1.0
 */

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TradeDirection {
  BUY = 'BUY',
  SELL = 'SELL',
}

export enum AssetClass {
  EQUITY = 'EQUITY',
  ETF = 'ETF',
  OPTION = 'OPTION',
  CRYPTO = 'CRYPTO',
  FIXED_INCOME = 'FIXED_INCOME',
}

export enum TaxMethod {
  FIFO = 'FIFO',
}

export enum HoldingPeriod {
  SHORT_TERM = 'SHORT_TERM', // < 1 year
  LONG_TERM = 'LONG_TERM',  // >= 1 year
}

export enum ExportFormat {
  TRADES = 'TRADES',
  TAX_LOTS = 'TAX_LOTS',
}

// ─── Core Domain Entities ─────────────────────────────────────────────────────

/** A named collection of positions owned by a user */
export interface Portfolio {
  id: string;
  name: string;
  description: string | null;
  currency: string;      // ISO 4217 e.g. 'USD'
  taxMethod: TaxMethod;
  createdAt: Date;
  updatedAt: Date;
}

/** A single symbol held within a portfolio */
export interface Position {
  id: string;
  portfolioId: string;
  symbol: string;
  assetClass: AssetClass;
  /** Total shares currently held (fractional allowed) */
  sharesHeld: number;
  /** Weighted average cost basis in cents */
  avgCostBasisCents: number;
  openedAt: Date;
  updatedAt: Date;
}

/**
 * A FIFO tax lot — one line-item of shares acquired at a specific cost basis.
 * Lots are append-only; closing a lot creates a realized gain/loss record.
 */
export interface TaxLot {
  id: string;
  positionId: string;
  portfolioId: string;
  symbol: string;
  /** Shares originally acquired in this lot */
  sharesAcquired: number;
  /** Shares remaining open (decrements on SELL, FIFO order) */
  sharesRemaining: number;
  /** Cost per share in cents at acquisition */
  costBasisPerShareCents: number;
  acquiredAt: Date;
  closedAt: Date | null;
  holdingPeriod: HoldingPeriod | null;
}

/** An immutable trade event — append-only log */
export interface Trade {
  id: string;
  portfolioId: string;
  positionId: string;
  symbol: string;
  direction: TradeDirection;
  shares: number;
  /** Execution price per share in cents */
  pricePerShareCents: number;
  /** Total commission/fees in cents */
  commissionCents: number;
  /** Gross notional value in cents (shares × price) */
  notionalCents: number;
  /** Idempotency key — prevents double-submission */
  idempotencyKey: string;
  executedAt: Date;
  createdAt: Date;
}

/** Real-time or snapshot market quote */
export interface Quote {
  symbol: string;
  /** Last trade price in cents */
  lastPriceCents: number;
  /** Previous close price in cents */
  prevCloseCents: number;
  /** Change from prev close in cents */
  changeCents: number;
  /** Change from prev close as basis points (e.g. 150 = +1.50%) */
  changeBps: number;
  bidCents: number;
  askCents: number;
  volume: number;
  timestamp: Date;
}

/** Aggregated cost basis for a position */
export interface CostBasis {
  positionId: string;
  symbol: string;
  totalSharesHeld: number;
  totalCostCents: number;
  avgCostPerShareCents: number;
  openLots: TaxLot[];
}

/** P&L summary for a portfolio or position */
export interface PnLSummary {
  portfolioId: string;
  /** Total market value in cents */
  marketValueCents: number;
  /** Total cost basis in cents */
  costBasisCents: number;
  /** Unrealized gain/loss in cents */
  unrealizedPnlCents: number;
  /** Unrealized gain/loss in basis points */
  unrealizedPnlBps: number;
  /** Realized gain/loss in cents (within requested date range) */
  realizedPnlCents: number;
  /** Day change in cents */
  dayChangeCents: number;
  /** Day change in basis points */
  dayChangeBps: number;
  calculatedAt: Date;
}

// ─── DTOs (request/response shapes) ──────────────────────────────────────────

export interface CreatePortfolioDTO {
  name: string;
  description?: string;
  currency?: string;
}

export interface CreateTradeDTO {
  portfolioId: string;
  symbol: string;
  direction: TradeDirection;
  shares: number;
  /** Execution price per share in cents */
  pricePerShareCents: number;
  commissionCents?: number;
  executedAt?: Date;
  idempotencyKey: string;
}

export interface TradeFilter {
  symbol?: string;
  direction?: TradeDirection;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

export interface DateRange {
  fromDate: Date;
  toDate: Date;
}

export interface CsvExportOptions {
  portfolioId: string;
  format: ExportFormat;
  dateRange?: DateRange;
  symbol?: string;
}

// ─── Error types ──────────────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const ErrorCodes = {
  PORTFOLIO_NOT_FOUND: 'PORTFOLIO_NOT_FOUND',
  POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
  TRADE_NOT_FOUND: 'TRADE_NOT_FOUND',
  INSUFFICIENT_SHARES: 'INSUFFICIENT_SHARES',
  DUPLICATE_TRADE: 'DUPLICATE_TRADE',
  INVALID_TRADE: 'INVALID_TRADE',
  MARKET_DATA_UNAVAILABLE: 'MARKET_DATA_UNAVAILABLE',
  EXPORT_FAILED: 'EXPORT_FAILED',
} as const;

// ─── WebSocket event types ────────────────────────────────────────────────────

export interface PriceUpdateEvent {
  symbol: string;
  quote: Quote;
}

export interface SubscribeRequest {
  portfolioId: string;
  symbols: string[];
}
