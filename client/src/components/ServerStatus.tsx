import { RefreshCw, ServerCrash, WifiOff } from 'lucide-react';
import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { WelcomeScreen } from './WelcomeScreen';

/**
 * Decides what to show before the app proper: a loading state, the "can't reach server"
 * screen, or the first-run welcome. Otherwise renders the app.
 */
export const StartupGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { ready, initialLoadError, refreshContext, settings } = useApp();
  const [retrying, setRetrying] = useState(false);

  if (ready) return settings.setupComplete ? <>{children}</> : <WelcomeScreen />;
  if (!initialLoadError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-400" aria-label="Loading" />
      </div>
    );
  }

  const retry = async () => {
    setRetrying(true);
    try {
      await refreshContext();
    } catch {
      // still down; message stays
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-slate-950">
      <div className="max-w-md w-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-full bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center">
          <ServerCrash className="w-6 h-6 text-rose-600 dark:text-rose-400" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Can't reach Ledgerity
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{initialLoadError}</p>
        </div>
        <div className="text-left text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 rounded-lg p-3 space-y-1">
          <p className="font-semibold text-slate-700 dark:text-slate-300">On the PC running Ledgerity:</p>
          <p>
            Open a terminal in the <code className="font-mono-num">ledgerity</code> folder and run{' '}
            <code className="font-mono-num font-semibold">npm start</code> (or{' '}
            <code className="font-mono-num">npm run dev</code> while developing).
          </p>
          <p>On a phone, make sure it's on the same Wi-Fi and Phone access is on in Settings.</p>
        </div>
        <button
          type="button"
          onClick={() => void retry()}
          disabled={retrying}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
          {retrying ? 'Retrying…' : 'Try again'}
        </button>
      </div>
    </div>
  );
};

/** Slim banner shown when the server drops out mid-session. */
export const OfflineBanner: React.FC = () => {
  const { serverOnline, ready } = useApp();
  if (serverOnline || !ready) return null;
  return (
    <div
      role="status"
      className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 border-b border-amber-200 dark:border-amber-900"
    >
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>
        Lost connection to the Ledgerity server. Changes won't save until it's back. Reload the
        page once it's running again.
      </span>
    </div>
  );
};
