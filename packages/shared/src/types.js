"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ErrorCodes = exports.AppError = exports.ExportFormat = exports.HoldingPeriod = exports.TaxMethod = exports.AssetClass = exports.TradeDirection = void 0;
var TradeDirection;
(function (TradeDirection) {
    TradeDirection["BUY"] = "BUY";
    TradeDirection["SELL"] = "SELL";
})(TradeDirection || (exports.TradeDirection = TradeDirection = {}));
var AssetClass;
(function (AssetClass) {
    AssetClass["EQUITY"] = "EQUITY";
    AssetClass["ETF"] = "ETF";
    AssetClass["OPTION"] = "OPTION";
    AssetClass["CRYPTO"] = "CRYPTO";
    AssetClass["FIXED_INCOME"] = "FIXED_INCOME";
})(AssetClass || (exports.AssetClass = AssetClass = {}));
var TaxMethod;
(function (TaxMethod) {
    TaxMethod["FIFO"] = "FIFO";
})(TaxMethod || (exports.TaxMethod = TaxMethod = {}));
var HoldingPeriod;
(function (HoldingPeriod) {
    HoldingPeriod["SHORT_TERM"] = "SHORT_TERM";
    HoldingPeriod["LONG_TERM"] = "LONG_TERM";
})(HoldingPeriod || (exports.HoldingPeriod = HoldingPeriod = {}));
var ExportFormat;
(function (ExportFormat) {
    ExportFormat["TRADES"] = "TRADES";
    ExportFormat["TAX_LOTS"] = "TAX_LOTS";
})(ExportFormat || (exports.ExportFormat = ExportFormat = {}));
class AppError extends Error {
    constructor(code, message, statusCode = 400, meta) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.meta = meta;
        this.name = 'AppError';
    }
}
exports.AppError = AppError;
exports.ErrorCodes = {
    PORTFOLIO_NOT_FOUND: 'PORTFOLIO_NOT_FOUND',
    POSITION_NOT_FOUND: 'POSITION_NOT_FOUND',
    TRADE_NOT_FOUND: 'TRADE_NOT_FOUND',
    INSUFFICIENT_SHARES: 'INSUFFICIENT_SHARES',
    DUPLICATE_TRADE: 'DUPLICATE_TRADE',
    INVALID_TRADE: 'INVALID_TRADE',
    MARKET_DATA_UNAVAILABLE: 'MARKET_DATA_UNAVAILABLE',
    EXPORT_FAILED: 'EXPORT_FAILED',
};
//# sourceMappingURL=types.js.map