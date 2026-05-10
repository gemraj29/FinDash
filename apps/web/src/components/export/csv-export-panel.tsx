'use client';
import { useState } from 'react';
import { Download, FileText, Layers, Calendar, Loader2, CheckCircle } from 'lucide-react';
import { ExportFormat } from '@findash/shared';
import { clsx } from 'clsx';

interface CsvExportPanelProps {
  portfolioId: string | null;
}

type ExportStatus = 'idle' | 'loading' | 'success' | 'error';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

/**
 * CsvExportPanel — export modal for trades and FIFO tax lots.
 * Calls csvExportService endpoints:
 *   GET /portfolios/:id/export/trades
 *   GET /portfolios/:id/export/tax-lots
 * Dashboard UI style: zinc-900 card, form controls, download indicator.
 */
export function CsvExportPanel({ portfolioId }: CsvExportPanelProps) {
  const [format, setFormat] = useState<ExportFormat>(ExportFormat.TRADES);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [symbol, setSymbol] = useState('');
  const [status, setStatus] = useState<ExportStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  if (!portfolioId) return null;

  const handleExport = async () => {
    setStatus('loading');
    setErrorMsg('');

    try {
      const token = localStorage.getItem('findash_token');
      const params = new URLSearchParams();
      if (fromDate) params.set('fromDate', fromDate);
      if (toDate) params.set('toDate', toDate);
      if (symbol && format === ExportFormat.TRADES) params.set('symbol', symbol.toUpperCase());

      const endpoint =
        format === ExportFormat.TRADES
          ? `/portfolios/${portfolioId}/export/trades`
          : `/portfolios/${portfolioId}/export/tax-lots`;

      const qs = params.toString();
      const res = await fetch(`${BASE_URL}${endpoint}${qs ? `?${qs}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) throw new Error(`Export failed: ${res.statusText}`);

      // Trigger browser download
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filename = disposition.match(/filename="(.+)"/)?.[1] ?? 'export.csv';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Export failed');
      setStatus('error');
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold text-zinc-100">Export Data</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Download trades or FIFO tax lots as CSV</p>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-5">
        {/* Format selector */}
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-3">Export Type</label>
          <div className="grid grid-cols-2 gap-3">
            {[
              {
                value: ExportFormat.TRADES,
                label: 'Trades',
                desc: 'Full trade log with prices, commissions, and notional values',
                icon: <FileText className="w-5 h-5" />,
              },
              {
                value: ExportFormat.TAX_LOTS,
                label: 'Tax Lots',
                desc: 'FIFO lot details: cost basis, holding period, open/closed status',
                icon: <Layers className="w-5 h-5" />,
              },
            ].map(({ value, label, desc, icon }) => (
              <button
                key={value}
                onClick={() => setFormat(value)}
                className={clsx(
                  'p-4 rounded-lg border text-left transition-colors',
                  format === value
                    ? 'border-green-500/50 bg-green-400/5 text-zinc-100'
                    : 'border-zinc-700 bg-zinc-800/50 text-zinc-400 hover:border-zinc-600',
                )}
              >
                <div className={clsx('mb-2', format === value ? 'text-green-400' : 'text-zinc-500')}>
                  {icon}
                </div>
                <p className="font-medium text-sm">{label}</p>
                <p className="text-xs mt-1 text-zinc-500 leading-relaxed">{desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Date range */}
        <div>
          <label className="text-sm font-medium text-zinc-300 block mb-3 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-zinc-500" />
            Date Range (optional)
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-500 block mb-1">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
            <div>
              <label className="text-xs text-zinc-500 block mb-1">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-zinc-500 transition-colors"
              />
            </div>
          </div>
        </div>

        {/* Symbol filter (trades only) */}
        {format === ExportFormat.TRADES && (
          <div>
            <label className="text-sm font-medium text-zinc-300 block mb-1">
              Symbol Filter (optional)
            </label>
            <input
              type="text"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
              placeholder="e.g. AAPL"
              className="w-48 bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 transition-colors"
            />
          </div>
        )}

        {/* Download button */}
        <div className="pt-2">
          <button
            onClick={handleExport}
            disabled={status === 'loading'}
            className={clsx(
              'flex items-center gap-2 px-5 py-2.5 rounded-md font-medium text-sm transition-all',
              status === 'loading'
                ? 'bg-zinc-700 text-zinc-400 cursor-not-allowed'
                : status === 'success'
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-green-500 text-white hover:bg-green-400',
            )}
          >
            {status === 'loading' && <Loader2 className="w-4 h-4 animate-spin" />}
            {status === 'success' && <CheckCircle className="w-4 h-4" />}
            {status === 'idle' || status === 'error' ? <Download className="w-4 h-4" /> : null}
            {status === 'loading'
              ? 'Generating CSV…'
              : status === 'success'
              ? 'Downloaded!'
              : 'Download CSV'}
          </button>

          {status === 'error' && (
            <p className="mt-2 text-sm text-red-400">{errorMsg}</p>
          )}
        </div>
      </div>

      {/* Info box */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 text-sm text-zinc-500 space-y-1">
        <p className="font-medium text-zinc-400">CSV Format Notes</p>
        <p>All monetary values are exported in both cents and USD for flexibility.</p>
        <p>Tax lot exports include holding period classification (Short-term / Long-term).</p>
        <p>Amounts in cents are exact integers suitable for spreadsheet calculations.</p>
      </div>
    </div>
  );
}
