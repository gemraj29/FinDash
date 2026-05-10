import { DashboardShell } from '../../../components/layout/dashboard-shell';
import { TaxLotView } from '../../../components/tax-lots/tax-lot-view';

export default function TaxLotsPage() {
  return (
    <DashboardShell>
      {(portfolioId) => <TaxLotView portfolioId={portfolioId} />}
    </DashboardShell>
  );
}
