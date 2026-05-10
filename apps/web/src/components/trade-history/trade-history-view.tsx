'use client';
import { useState } from 'react';
import { ArrowUp, ArrowDown, Filter } from 'lucide-react';
import { useTrades } from '../../hooks/use-portfolios';
import { formatCents } from '../../lib/api-client';
import { Trade, TradeDirection } from '@findash/shared';
import { clsx } from 'clsx';

interface TradeHistoryViewProps {
  portfolioId: string | null;
}

/**
 * TradeHistoryView — chronological trade log with filters.
 * Calls portfolioService.getTradeHistory(portfolioId, filters).
 * Dashboard UI style: dense sortable table, direction badges, zinc-900.
 */
export function TradeHistoryView({ portfolioId }: TradeHistoryViewProps) {
  const [symbol, setSymbol] = useState('');
  const [direction, setDirection] = useState<'' | 'BUY' | 'SELL'>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const params = new URLSearchParams();
  if (symbol) params.set('symbol', symbol.toUpperCase());
  if (direction) params.set('direction', direction);
  if (fromDate) params.set('fromDate', fromDate);
  if (toDate) params.set('toDate', toDate);

  const { data: trades = [], isLoading } = useTrades(
    portfolioId,
    params.toString() ? `?${params.toString()}` : '',
  );

  if (!portfolioId) return null;

  const clearFilters = () => {
    setSymbol('');
    setDirection('');
    setFromDate('');
    setToDate('');
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Trade History</h1>
          <p className="text-sm text-zinc-500 mt-0.5">Append-only trade event log · {trades.length} records</p>
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-zinc-400 border border-zinc-700 rounded-md hover:bg-zinc-800 transition-colors"
        >
          <Filter className="w-3.5 h-3.5" />
          Filters
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Symbol</label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="AAPL"
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">Direction</label>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as '' | 'BUY' | 'SELL')}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            >
              <option value="">All</option>
              <option value="BUY">BUY</option>
              <option value="SELL">SELL</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">From Date</label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div>
            <label className="text-xs text-zinc-500 block mb-1">To Date</label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500"
            />
          </div>
          <div className="col-span-full flex justify-end">
            <button
              onClick={clearFilters}
              className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Clear filters
            </button>
          </div>
        </div>
      )}

      {/* Trade table */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Date', 'Symbol', 'Direction', 'Shares', 'Price', 'Commission', 'Notional', 'Trade ID'].map(
                  (col) => (
                    <th
                      key={col}
                      className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                    >
                      {col}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-zinc-800 rounded animate-pulse w-16" />
                        </td>
                      ))}
                    </tr>
                  ))
                : trades.map((trade) => <TradeRow key={trade.id} trade={trade} />)}
              {!isLoading && trades.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500 text-sm">
                    No trades found matching your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const isBuy = trade.direction === TradeDirection.BUY;
  return (
    <tr className="hover:bg-zinc-800/50 transition-colors">
      <td className="px-4 py-3 text-zinc-400 whitespace-nowrap text-xs">
        {new Date(trade.executedAt).toLocaleDateString()}{' '}
        <span className="text-zinc-600">{new Date(trade.executedAt).toLocaleTimeString()}</span>
      </td>
      <td className="px-4 py-3 font-semibold text-zinc-100 font-mono">{trade.symbol}</td>
      <td className="px-4 py-3">
        <span
          className={clsx(
            'inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium',
            isBuy
              ? 'bg-green-400/10 text-green-400'
              : 'bg-red-400/10 text-red-400',
          )}
        >
          {isBuy ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
          {trade.direction}
        </span>
      </td>
      <td className="px-4 py-3 tabular-nums text-zinc-300">{trade.shares.toLocaleString()}</td>
      <td className="px-4 py-3 tabular-nums text-zinc-300">{formatCents(trade.pricePerShareCents)}</td>
      <td className="px-4 py-3 tabular-nums text-zinc-500">{formatCents(trade.commissionCents)}</td>
      <td className="px-4 py-3 tabular-nums text-zinc-100 font-medium">{formatCents(trade.notionalCents)}</td>
      <td className="px-4 py-3 font-mono text-xs text-zinc-600">{trade.id.split('-')[0]}…</td>
    </tr>
  );
}
