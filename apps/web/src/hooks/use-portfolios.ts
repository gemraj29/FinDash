'use client';
import useSWR from 'swr';
import { Portfolio, Position, PnLSummary, Trade } from '@findash/shared';
import { api } from '../lib/api-client';

const fetcher = (url: string) => api.get<any>(url);

export function usePortfolios() {
  return useSWR<Portfolio[]>('/portfolios', fetcher);
}

export function usePortfolio(id: string | null) {
  return useSWR<Portfolio>(id ? `/portfolios/${id}` : null, fetcher);
}

export function usePositions(portfolioId: string | null) {
  return useSWR<Position[]>(portfolioId ? `/portfolios/${portfolioId}/positions` : null, fetcher, {
    refreshInterval: 30_000, // refresh every 30s
  });
}

export function useUnrealizedPnl(portfolioId: string | null) {
  return useSWR<PnLSummary>(
    portfolioId ? `/portfolios/${portfolioId}/pnl/unrealized` : null,
    fetcher,
    { refreshInterval: 10_000 },
  );
}

export function useRealizedPnl(portfolioId: string | null, fromDate?: string, toDate?: string) {
  const params = fromDate && toDate ? `?fromDate=${fromDate}&toDate=${toDate}` : '';
  return useSWR<PnLSummary>(
    portfolioId && fromDate && toDate
      ? `/portfolios/${portfolioId}/pnl/realized${params}`
      : null,
    fetcher,
  );
}

export function useTrades(portfolioId: string | null, params = '') {
  return useSWR<Trade[]>(
    portfolioId ? `/portfolios/${portfolioId}/trades${params}` : null,
    fetcher,
  );
}
