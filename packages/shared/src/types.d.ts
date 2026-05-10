export declare enum TradeDirection {
    BUY = "BUY",
    SELL = "SELL"
}
export declare enum AssetClass {
    EQUITY = "EQUITY",
    ETF = "ETF",
    OPTION = "OPTION",
    CRYPTO = "CRYPTO",
    FIXED_INCOME = "FIXED_INCOME"
}
export declare enum TaxMethod {
    FIFO = "FIFO"
}
export declare enum HoldingPeriod {
    SHORT_TERM = "SHORT_TERM",
    LONG_TERM = "LONG_TERM"
}
export declare enum ExportFormat {
    TRADES = "TRADES",
    TAX_LOTS = "TAX_LOTS"
}
export interface Portfolio {
    id: string;
    name: string;
    description: string | null;
    currency: string;
    taxMethod: TaxMethod;
    createdAt: Date;
    updatedAt: Date;
}
export interface Position {
    id: string;
    portfolioId: string;
    symbol: string;
    assetClass: AssetClass;
    sharesHeld: number;
    avgCostBasisCents: number;
    openedAt: Date;
    updatedAt: Date;
}
export interface TaxLot {
    id: string;
    positionId: string;
    portfolioId: string;
    symbol: string;
    sharesAcquired: number;
    sharesRemaining: number;
    costBasisPerShareCents: number;
    acquiredAt: Date;
    closedAt: Date | null;
    holdingPeriod: HoldingPeriod | null;
}
export interface Trade {
    id: string;
    portfolioId: string;
    positionId: string;
    symbol: string;
    direction: TradeDirection;
    shares: number;
    pricePerShareCents: number;
    commissionCents: number;
    notionalCents: number;
    idempotencyKey: string;
    executedAt: Date;
    createdAt: Date;
}
export interface Quote {
    symbol: string;
    lastPriceCents: number;
    prevCloseCents: number;
    changeCents: number;
    changeBps: number;
    bidCents: number;
    askCents: number;
    volume: number;
    timestamp: Date;
}
export interface CostBasis {
    positionId: string;
    symbol: string;
    totalSharesHeld: number;
    totalCostCents: number;
    avgCostPerShareCents: number;
    openLots: TaxLot[];
}
export interface PnLSummary {
    portfolioId: string;
    marketValueCents: number;
    costBasisCents: number;
    unrealizedPnlCents: number;
    unrealizedPnlBps: number;
    realizedPnlCents: number;
    dayChangeCents: number;
    dayChangeBps: number;
    calculatedAt: Date;
}
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
export declare class AppError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly meta?: Record<string, unknown> | undefined;
    constructor(code: string, message: string, statusCode?: number, meta?: Record<string, unknown> | undefined);
}
export declare const ErrorCodes: {
    readonly PORTFOLIO_NOT_FOUND: "PORTFOLIO_NOT_FOUND";
    readonly POSITION_NOT_FOUND: "POSITION_NOT_FOUND";
    readonly TRADE_NOT_FOUND: "TRADE_NOT_FOUND";
    readonly INSUFFICIENT_SHARES: "INSUFFICIENT_SHARES";
    readonly DUPLICATE_TRADE: "DUPLICATE_TRADE";
    readonly INVALID_TRADE: "INVALID_TRADE";
    readonly MARKET_DATA_UNAVAILABLE: "MARKET_DATA_UNAVAILABLE";
    readonly EXPORT_FAILED: "EXPORT_FAILED";
};
export interface PriceUpdateEvent {
    symbol: string;
    quote: Quote;
}
export interface SubscribeRequest {
    portfolioId: string;
    symbols: string[];
}
