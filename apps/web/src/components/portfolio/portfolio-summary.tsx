'use client';
import { TrendingUp, TrendingDown, DollarSign, Calendar } from 'lucide-react';
import { useUnrealizedPnl, useRealizedPnl } from '../../hooks/use-portfolios';
import { formatCents, formatBps, pnlColor } from '../../lib/api-client';
import { clsx } from 'clsx';

interface PortfolioSummaryProps {
  portfolioId: string | null;
}

/**
 * PortfolioSummary — P&L metric card grid.
 * Calls pnlService.calculateUnrealizedPnl() + calculateRealizedPnl().
 * Dashboard UI style: dark zinc-900 cards, green/red P&L indicators.
 */
export function PortfolioSummary({ portfolioId }: PortfolioSummaryProps) {
  const ytdFrom = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
  const today = new Date().toISOString().split('T')[0];

  const { data: unrealized, isLoading: uLoading } = useUnrealizedPnl(portfolioId);
  const { data: realized, isLoading: rLoading } = useRealizedPnl(portfolioId, ytdFrom, today);

  if (!portfolioId) return null;

  const isLoading = uLoading || rLoading;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Portfolio Overview</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Real-time P&L · FIFO tax-lot accounting</p>
      </div>

      {/* Metric cards grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <MetricCard
          label="Total Market Value"
          value={isLoading ? null : formatCents(unrealized?.marketValueCents ?? 0)}
          icon={<DollarSign className="w-4 h-4" />}
          loading={isLoading}
        />
        <MetricCard
          label="Unrealized P&L"
          value={isLoading ? null : formatCents(unrealized?.unrealizedPnlCents ?? 0, true)}
          subValue={isLoading ? null : formatBps(unrealized?.unrealizedPnlBps ?? 0)}
          color={pnlColor(unrealized?.unrealizedPnlCents ?? 0)}
          icon={
            (unrealized?.unrealizedPnlCents ?? 0) >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )
          }
          loading={isLoading}
        />
        <MetricCard
          label="Realized P&L (YTD)"
          value={isLoading ? null : formatCents(realized?.realizedPnlCents ?? 0, true)}
          color={pnlColor(realized?.realizedPnlCents ?? 0)}
          icon={<Calendar className="w-4 h-4" />}
          loading={isLoading}
        />
        <MetricCard
          label="Day Change"
          value={isLoading ? null : formatCents(unrealized?.dayChangeCents ?? 0, true)}
          subValue={isLoading ? null : formatBps(unrealized?.dayChangeBps ?? 0)}
          color={pnlColor(unrealized?.dayChangeCents ?? 0)}
          icon={
            (unrealized?.dayChangeCents ?? 0) >= 0 ? (
              <TrendingUp className="w-4 h-4" />
            ) : (
              <TrendingDown className="w-4 h-4" />
            )
          }
          loading={isLoading}
        />
      </div>

      {/* Cost basis breakdown */}
      {!isLoading && unrealized && (
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5">
          <h2 className="text-sm font-medium text-zinc-400 mb-4">Cost Basis Breakdown</h2>
          <div className="grid grid-cols-3 gap-6">
            <Stat
              label="Total Cost Basis"
              value={formatCents(unrealized.costBasisCents)}
            />
            <Stat
              label="Total Market Value"
              value={formatCents(unrealized.marketValueCents)}
            />
            <Stat
              label="Unrealized Return"
              value={formatBps(unrealized.unrealizedPnlBps)}
              valueClass={pnlColor(unrealized.unrealizedPnlBps)}
            />
          </div>
          <p className="text-xs text-zinc-600 mt-4">
            Updated {new Date(unrealized.calculatedAt).toLocaleTimeString()}
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface MetricCardProps {
  label: string;
  value: string | null;
  subValue?: string | null;
  color?: string;
  icon: React.ReactNode;
  loading: boolean;
}

function MetricCard({ label, value, subValue, color = 'text-zinc-100', icon, loading }: MetricCardProps) {
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-5 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-zinc-500 uppercase tracking-wider">{label}</span>
        <span className="text-zinc-600">{icon}</span>
      </div>
      {loading ? (
        <div className="h-7 w-32 bg-zinc-800 rounded animate-pulse" />
      ) : (
        <div>
          <p className={clsx('text-2xl font-semibold tabular-nums', color)}>{value}</p>
          {subValue && (
            <p className={clsx('text-xs tabular-nums mt-0.5', color, 'opacity-70')}>{subValue}</p>
          )}
        </div>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  valueClass = 'text-zinc-100',
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1">{label}</p>
      <p className={clsx('text-sm font-medium tabular-nums', valueClass)}>{value}</p>
    </div>
  );
}
