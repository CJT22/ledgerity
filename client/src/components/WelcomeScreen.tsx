import { ArrowRight, LineChart, Receipt, Sparkles } from 'lucide-react';
import React, { useState } from 'react';
import { api } from '../api';
import { useApp } from '../context/AppContext';

/** First-run screen (settings.setupComplete = false): start empty or explore the demo. */
export const WelcomeScreen: React.FC = () => {
  const { updateSettings, refreshContext, toast } = useApp();
  const [busy, setBusy] = useState<'fresh' | 'demo' | null>(null);

  const startFresh = async () => {
    setBusy('fresh');
    try {
      await updateSettings({ setupComplete: true });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      setBusy(null);
    }
  };

  const loadDemo = async () => {
    setBusy('demo');
    try {
      await api.resetDemoData();
      await refreshContext();
      toast('Demo data loaded. Erase it any time in Settings.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-2xl w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-baseline gap-2">
            <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
              Welcome to Ledgerity
            </h1>
            <span className="text-xs font-mono-num text-slate-400">v{__APP_VERSION__}</span>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg mx-auto">
            Track what your big purchases really cost, and see where your money will be by next
            payday. Everything stays on this computer.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            type="button"
            onClick={() => void startFresh()}
            disabled={busy !== null}
            className="group flex flex-col items-start text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-emerald-400 dark:hover:border-emerald-600 transition-colors disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <Receipt className="w-5 h-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              Start fresh
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Begin with an empty workspace and add your own expenses and projections.
            </p>
            <span className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {busy === 'fresh' ? 'Setting up…' : 'Get started'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>

          <button
            type="button"
            onClick={() => void loadDemo()}
            disabled={busy !== null}
            className="group flex flex-col items-start text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-violet-400 dark:hover:border-violet-600 transition-colors disabled:opacity-60"
          >
            <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-950/60 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="mt-4 text-base font-semibold text-slate-900 dark:text-slate-100">
              Explore with demo data
            </h2>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Sample expenses, installment plans and projections to try every feature. Erase it
              later in Settings when you're ready.
            </p>
            <span className="mt-auto pt-4 inline-flex items-center gap-1 text-xs font-semibold text-violet-700 dark:text-violet-400">
              {busy === 'demo' ? 'Loading demo…' : 'Load demo'}
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
          </button>
        </div>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <LineChart className="w-3.5 h-3.5" />
          Currency, paydays and phone access can be changed any time in Settings.
        </p>
      </div>
    </div>
  );
};
