'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Layers, ChevronDown, ChevronUp } from 'lucide-react';
import { usePositions } from '../../hooks/use-portfolios';
import { formatCents, pnlColor, api } from '../../lib/api-client';
import { CostBasis, TaxLot } from '@findash/shared';
import { clsx } from 'clsx';

interface TaxLotViewProps {
  portfolioId: string | null;
}

/**
 * TaxLotView — FIFO lot breakdown per position.
 * Calls taxLotService.computeCostBasis(positionId) for each position.
 * Shows: Lot ID, Open Date, Shares Acquired/Remaining, Cost Basis, Holding Period.
 * Dashboard UI style: collapsible per-symbol sections, zinc-900 cards.
 */
export function TaxLotView({ portfolioId }: TaxLotViewProps) {
  const { data: positions = [], isLoading } = usePositions(portfolioId);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (!portfolioId) return null;

  const toggleExpand = (posId: string) =>
    setExpanded((prev) => ({ ...prev, [posId]: !prev[posId] }));

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Tax Lots</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          FIFO allocation · Cost basis per lot
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 bg-zinc-900 rounded-lg border border-zinc-800 animate-pulse" />
          ))}
        </div>
      ) : positions.length === 0 ? (
        <div className="text-center py-16 text-zinc-500">No open positions with tax lots.</div>
      ) : (
        <div className="space-y-3">
          {positions.map((pos) => (
            <PositionLotSection
              key={pos.id}
              positionId={pos.id}
              symbol={pos.symbol}
              sharesHeld={pos.sharesHeld}
              expanded={!!expanded[pos.id]}
              onToggle={() => toggleExpand(pos.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Per-position accordion section ───────────────────────────────────────────

function PositionLotSection({
  positionId,
  symbol,
  sharesHeld,
  expanded,
  onToggle,
}: {
  positionId: string;
  symbol: string;
  sharesHeld: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { data: costBasis, isLoading } = useSWR<CostBasis>(
    expanded ? `/positions/${positionId}/cost-basis` : null,
    (url: string) => api.get<CostBasis>(url),
  );

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-zinc-800/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Layers className="w-4 h-4 text-zinc-500" />
          <span className="font-semibold text-zinc-100 font-mono">{symbol}</span>
          <span className="text-sm text-zinc-500">{sharesHeld.toLocaleString()} shares held</span>
        </div>
        <div className="flex items-center gap-3">
          {costBasis && (
            <span className="text-sm text-zinc-400">
              Avg Cost: {formatCents(costBasis.avgCostPerShareCents)}/share
            </span>
          )}
          {expanded ? (
            <ChevronUp className="w-4 h-4 text-zinc-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-zinc-500" />
          )}
        </div>
      </button>

      {/* Lot detail table */}
      {expanded && (
        <div className="border-t border-zinc-800">
          {isLoading ? (
            <div className="px-5 py-6 text-center text-zinc-500 text-sm animate-pulse">
              Loading lots…
            </div>
          ) : costBasis && costBasis.openLots.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-800/40">
                    {['Lot ID', 'Opened', 'Acquired', 'Remaining', 'Cost/Share', 'Total Cost', 'Holding Period', 'Status'].map(
                      (col) => (
                        <th
                          key={col}
                          className="px-4 py-2.5 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {costBasis.openLots.map((lot) => (
                    <LotRow key={lot.id} lot={lot} />
                  ))}
                </tbody>
              </table>
              <div className="px-5 py-3 border-t border-zinc-800 flex gap-6 text-xs text-zinc-500">
                <span>
                  Total Cost: <span className="text-zinc-300 tabular-nums">{formatCents(costBasis.totalCostCents)}</span>
                </span>
                <span>
                  Avg Cost/Share: <span className="text-zinc-300 tabular-nums">{formatCents(costBasis.avgCostPerShareCents)}</span>
                </span>
                <span>
                  Open Lots: <span className="text-zinc-300">{costBasis.openLots.length}</span>
                </span>
              </div>
            </div>
          ) : (
            <div className="px-5 py-6 text-center text-zinc-500 text-sm">No open lots.</div>
          )}
        </div>
      )}
    </div>
  );
}

function LotRow({ lot }: { lot: TaxLot }) {
  const isOpen = !lot.closedAt;
  const acquiredDate = new Date(lot.acquiredAt).toLocaleDateString();
  const lotShortId = lot.id.split('-')[0];

  return (
    <tr className="hover:bg-zinc-800/40 transition-colors">
      <td className="px-4 py-2.5 font-mono text-xs text-zinc-400">{lotShortId}…</td>
      <td className="px-4 py-2.5 text-zinc-400 whitespace-nowrap">{acquiredDate}</td>
      <td className="px-4 py-2.5 tabular-nums text-zinc-300">{lot.sharesAcquired.toLocaleString()}</td>
      <td className="px-4 py-2.5 tabular-nums text-zinc-300">{lot.sharesRemaining.toLocaleString()}</td>
      <td className="px-4 py-2.5 tabular-nums text-zinc-300">{formatCents(lot.costBasisPerShareCents)}</td>
      <td className="px-4 py-2.5 tabular-nums text-zinc-300">
        {formatCents(Math.round(lot.sharesAcquired * lot.costBasisPerShareCents))}
      </td>
      <td className="px-4 py-2.5">
        {lot.holdingPeriod ? (
          <span
            className={clsx(
              'text-xs px-2 py-0.5 rounded-full',
              lot.holdingPeriod === 'LONG_TERM'
                ? 'bg-green-400/10 text-green-400'
                : 'bg-amber-400/10 text-amber-400',
            )}
          >
            {lot.holdingPeriod === 'LONG_TERM' ? 'Long-term' : 'Short-term'}
          </span>
        ) : (
          <span className="text-zinc-600">—</span>
        )}
      </td>
      <td className="px-4 py-2.5">
        <span
          className={clsx(
            'text-xs px-2 py-0.5 rounded-full',
            isOpen ? 'bg-blue-400/10 text-blue-400' : 'bg-zinc-700 text-zinc-400',
          )}
        >
          {isOpen ? 'Open' : 'Closed'}
        </span>
      </td>
    </tr>
  );
}
