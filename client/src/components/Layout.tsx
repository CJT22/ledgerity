import {
  LayoutDashboard,
  Receipt,
  Settings as SettingsIcon,
  TrendingUp,
} from 'lucide-react';
import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { OfflineBanner } from './ServerStatus';
import { ThemeToggle } from './ThemeToggle';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/expenses', label: 'Expenses', icon: Receipt, end: false },
  { to: '/projections', label: 'Projections', icon: TrendingUp, end: false },
  { to: '/settings', label: 'Settings', icon: SettingsIcon, end: false },
];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col md:flex-row bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 sticky top-0 h-screen">
        <div className="px-5 py-5 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-baseline gap-2">
            <NavLink
              to="/"
              className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
            >
              Ledgerity
            </NavLink>
            <VersionTag />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Expenses &amp; Funds Projection
          </p>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Primary Navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = item.end
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-emerald-600 dark:text-emerald-400' : ''
                  }`}
                />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200 dark:border-slate-800">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">
            Appearance
          </div>
          <ThemeToggle fullWidth />
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 min-w-0 flex flex-col pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <OfflineBanner />
        {/* Mobile compact header */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm">
          <div className="flex items-baseline gap-2">
            <NavLink
              to="/"
              className="text-base font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap"
            >
              Ledgerity
            </NavLink>
            <VersionTag />
          </div>
          <ThemeToggle compact />
        </header>

        <main className="flex-1 w-full max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar (<= 15% viewport height) */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 pb-[env(safe-area-inset-bottom)] border-t border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm grid grid-cols-4"
        aria-label="Mobile Navigation"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = item.end
            ? location.pathname === item.to
            : location.pathname.startsWith(item.to);
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={`h-14 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="truncate max-w-full px-1">{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
    </div>
  );
};

/** App version (from package.json at build time). */
export const VersionTag: React.FC = () => (
  <span
    className="text-[10px] font-medium font-mono-num text-slate-400 dark:text-slate-500"
    title={`Ledgerity version ${__APP_VERSION__}`}
  >
    v{__APP_VERSION__}
  </span>
);
