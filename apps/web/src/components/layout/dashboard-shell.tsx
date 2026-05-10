'use client';
import { useState } from 'react';
import { Sidebar } from './sidebar';
import { usePortfolios } from '../../hooks/use-portfolios';

interface DashboardShellProps {
  children: (portfolioId: string | null) => React.ReactNode;
}

/**
 * DashboardShell — top-level layout for all dashboard pages.
 * Calls portfolioService.findAll() → renders sidebar + injects portfolioId to children.
 * Dashboard UI style: bg-zinc-950, sidebar zinc-900, border-zinc-800.
 */
export function DashboardShell({ children }: DashboardShellProps) {
  const { data: portfolios = [], isLoading } = usePortfolios();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Auto-select first portfolio on load
  const activeId = selectedId ?? portfolios[0]?.id ?? null;

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Sidebar */}
      <Sidebar
        portfolios={portfolios}
        selectedId={activeId}
        onSelectPortfolio={setSelectedId}
      />

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-400" />
          </div>
        ) : portfolios.length === 0 ? (
          <EmptyPortfolioState />
        ) : (
          children(activeId)
        )}
      </main>
    </div>
  );
}

function EmptyPortfolioState() {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-8">
      <div className="w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-3xl">
        📊
      </div>
      <h2 className="text-xl font-semibold text-zinc-100">No portfolios yet</h2>
      <p className="text-zinc-500 max-w-sm text-sm">
        Create your first portfolio to start tracking positions, P&L, and tax lots.
      </p>
    </div>
  );
}
