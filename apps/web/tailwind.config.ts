import type { Config } from 'tailwindcss';

/**
 * FinDash Tailwind config — Dashboard UI style
 * Dark zinc bg, metric cards, data-dense tables (Grafana-inspired)
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // FinDash design tokens — dashboard style
        brand: {
          DEFAULT: '#22c55e',  // green — gains / positive P&L
          dim: '#16a34a',
        },
        loss: {
          DEFAULT: '#ef4444',  // red — losses / negative P&L
          dim: '#dc2626',
        },
        surface: {
          DEFAULT: 'rgb(24 24 27)',   // zinc-900 — card bg
          raised: 'rgb(39 39 42)',    // zinc-800 — elevated card
          border: 'rgb(63 63 70)',    // zinc-700 — borders
        },
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      gridTemplateColumns: {
        'dashboard': 'repeat(4, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};

export default config;
