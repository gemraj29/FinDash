'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  BarChart3,
  TrendingUp,
  Layers,
  ClipboardList,
  Download,
  ChevronDown,
  Circle,
} from 'lucide-react';
import { Portfolio } from '@findash/shared';
import { clsx } from 'clsx';

interface SidebarProps {
  portfolios: Portfolio[];
  selectedId: string | null;
  onSelectPortfolio: (id: string) => void;
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', icon: BarChart3 },
  { href: '/dashboard/positions', label: 'Positions', icon: TrendingUp },
  { href: '/dashboard/tax-lots', label: 'Tax Lots', icon: Layers },
  { href: '/dashboard/trades', label: 'Trade History', icon: ClipboardList },
  { href: '/dashboard/export', label: 'Export', icon: Download },
];

export function Sidebar({ portfolios, selectedId, onSelectPortfolio }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-zinc-800">
        <span className="text-lg font-semibold tracking-tight">
          <span className="text-green-400">Fin</span>Dash
        </span>
        <p className="text-xs text-zinc-500 mt-0.5">Portfolio Tracker</p>
      </div>

      {/* Portfolio selector */}
      <div className="px-3 py-3 border-b border-zinc-800">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-2">Portfolio</p>
        <div className="space-y-0.5">
          {portfolios.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelectPortfolio(p.id)}
              className={clsx(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors flex items-center gap-2',
                selectedId === p.id
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
              )}
            >
              <Circle
                className={clsx(
                  'w-2 h-2 flex-shrink-0',
                  selectedId === p.id ? 'fill-green-400 text-green-400' : 'fill-zinc-600 text-zinc-600',
                )}
              />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2 px-2">Navigation</p>
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors',
                isActive
                  ? 'bg-zinc-700 text-zinc-100'
                  : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800',
              )}
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-zinc-800">
        <p className="text-xs text-zinc-600">FinDash v0.1.0 · FIFO</p>
      </div>
    </aside>
  );
}
