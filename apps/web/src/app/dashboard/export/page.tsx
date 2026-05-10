'use client';
import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { CsvExportPanel } from '../../../components/export/csv-export-panel';

export default function ExportPage() {
  return (
    <DashboardShell>
      {(portfolioId) => <CsvExportPanel portfolioId={portfolioId} />}
    </DashboardShell>
  );
}
