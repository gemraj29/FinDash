'use client';
import { useMemo } from 'react';
import { ArrowUp, ArrowDown, Wifi, WifiOff } from 'lucide-react';
import { usePositions } from '../../hooks/use-portfolios';
import { useMarketData } from '../../hooks/use-market-data';
import { formatCents, formatBps, pnlColor } from '../../lib/api-client';
import { Position } from '@findash/shared';
import { clsx } from 'clsx';

interface PositionsTableProps {
  portfolioId: string | null;
}

/**
 * PositionsTable — holdings grid with real-time prices via WebSocket.
 * Calls portfolioService.getPositions() → useMarketData for live quotes.
 * Dashboard UI style: data-dense sortable table, zinc-900 bg, green/red P&L.
 */
export function PositionsTable({ portfolioId }: PositionsTableProps) {
  const { data: positions = [], isLoading } = usePositions(portfolioId);

  const symbols = useMemo(() => positions.map((p) => p.symbol), [positions]);
  const { quotes, connected } = useMarketData(portfolioId, symbols);

  if (!portfolioId) return null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">Positions</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{positions.length} open positions</p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {connected ? (
            <><Wifi className="w-3 h-3 text-green-400" /><span className="text-green-400">Live</span></>
          ) : (
            <><WifiOff className="w-3 h-3 text-zinc-500" /><span className="text-zinc-500">Delayed</span></>
          )}
        </div>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {['Symbol', 'Shares', 'Avg Cost', 'Last Price', 'Market Value', 'Unrealized P&L', '% Change', 'Day Change'].map((col) => (
                  <th
                    key={col}
                    className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => <SkeletonRow key={i} />)
                : positions.map((pos) => (
                    <PositionRow key={pos.id} position={pos} quote={quotes[pos.symbol]} />
                  ))}
              {!isLoading && positions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-zinc-500 text-sm">
                    No open positions. Record a BUY trade to get started.
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

// ─── Row component ─────────────────────────────────────────────────────────────

function PositionRow({
  position,
  quote,
}: {
  position: Position;
  quote?: { lastPriceCents: number; changeCents: number; changeBps: number } | null;
}) {
  const lastPrice = quote?.lastPriceCents ?? null;
  const marketValueCents = lastPrice !== null ? Math.round(position.sharesHeld * lastPrice) : null;
  const unrealizedPnlCents =
    marketValueCents !== null
      ? marketValueCents - Math.round(position.sharesHeld * position.avgCostBasisCents)
      : null;
  const dayChangeCents = quote ? Math.round(position.sharesHeld * quote.changeCents) : null;

  return (
    <tr className="hover:bg-zinc-800/50 transition-colors">
      <td className="px-4 py-3">
        <span className="font-semibold text-zinc-100 font-mono">{position.symbol}</span>
        <span className="ml-2 text-xs text-zinc-500">{position.assetClass}</span>
      </td>
      <td className="px-4 py-3 text-zinc-300 tabular-nums">{position.sharesHeld.toLocaleString()}</td>
      <td className="px-4 py-3 text-zinc-300 tabular-nums">
        {formatCents(position.avgCostBasisCents)}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {lastPrice !== null ? (
          <span className="text-zinc-100 font-medium">{formatCents(lastPrice)}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {marketValueCents !== null ? (
          <span className="text-zinc-100">{formatCents(marketValueCents)}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {unrealizedPnlCents !== null ? (
          <span className={pnlColor(unrealizedPnlCents)}>
            {formatCents(unrealizedPnlCents, true)}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {quote ? (
          <span className={clsx('flex items-center gap-1', pnlColor(quote.changeBps))}>
            {quote.changeBps >= 0 ? (
              <ArrowUp className="w-3 h-3" />
            ) : (
              <ArrowDown className="w-3 h-3" />
            )}
            {formatBps(quote.changeBps)}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-3 tabular-nums">
        {dayChangeCents !== null ? (
          <span className={pnlColor(dayChangeCents)}>{formatCents(dayChangeCents, true)}</span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
    </tr>
  );
}

function SkeletonRow() {
  return (
    <tr className="border-b border-zinc-800">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-zinc-800 rounded animate-pulse w-20" />
        </td>
      ))}
    </tr>
  );
}
