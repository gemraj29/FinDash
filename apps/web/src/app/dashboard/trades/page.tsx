'use client';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { TradeHistoryView } from '../../../components/trade-history/trade-history-view';

export default function TradesPage() {
  return (
    <DashboardShell>
      {(portfolioId) => <TradeHistoryView portfolioId={portfolioId} />}
    </DashboardShell>
  );
}
