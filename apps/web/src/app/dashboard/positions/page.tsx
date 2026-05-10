'use client';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { PositionsTable } from '../../../components/positions/positions-table';

export default function PositionsPage() {
  return (
    <DashboardShell>
      {(portfolioId) => <PositionsTable portfolioId={portfolioId} />}
    </DashboardShell>
  );
}
