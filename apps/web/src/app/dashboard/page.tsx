import { DashboardShell } from '../../components/layout/dashboard-shell';
import { PortfolioSummary } from '../../components/portfolio/portfolio-summary';

export default function DashboardPage() {
  return (
    <DashboardShell>
      {(portfolioId) => <PortfolioSummary portfolioId={portfolioId} />}
    </DashboardShell>
  );
}
