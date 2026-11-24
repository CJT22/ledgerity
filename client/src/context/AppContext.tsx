import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { api, ApiError } from '../api';
import { SERVER_STATUS_EVENT, ServerStatusDetail } from '../api/errors';
import { DEFAULT_SETTINGS } from '@shared/defaults';
import { formatCompactMoney, formatDisplayDate, formatMoney } from '@shared/domain';
import { ISODate, Money, Settings } from '@shared/types';

export type ToastVariant = 'success' | 'error' | 'info';

export interface ToastMessage {
  id: string;
  message: string;
  variant: ToastVariant;
}

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmState {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface AppContextValue {
  settings: Settings;
  ready: boolean;
  /** False while the server can't be reached. */
  serverOnline: boolean;
  /** Set when the very first load failed (nothing to show yet). */
  initialLoadError: string | null;
  resolvedTheme: 'light' | 'dark';
  refreshContext: () => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  formatAmount: (cents: Money, opts?: { showSign?: boolean }) => string;
  formatCompact: (cents: Money) => string;
  formatDate: (iso: ISODate | null | undefined) => string;
  toast: (message: string, variant?: ToastVariant) => void;
  dismissToast: (id: string) => void;
  toasts: ToastMessage[];
  confirm: (options: ConfirmOptions) => Promise<boolean>;
  confirmState: ConfirmState | null;
  resolveConfirm: (value: boolean) => void;
}


const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [serverOnline, setServerOnline] = useState(true);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [systemDark, setSystemDark] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
      : false
  );
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const refreshContext = useCallback(async () => {
    setSettings(await api.getSettings());
    setReady(true);
    setInitialLoadError(null);
  }, []);

  useEffect(() => {
    refreshContext().catch((err: unknown) => {
      setInitialLoadError(err instanceof Error ? err.message : 'Failed to load Ledgerity');
    });
  }, [refreshContext]);

  // Track server reachability (reported by the HTTP client)
  useEffect(() => {
    const onStatus = (e: Event) => {
      const online = (e as CustomEvent<ServerStatusDetail>).detail.online;
      setServerOnline(online);
      if (online && !ready) void refreshContext().catch(() => undefined);
    };
    window.addEventListener(SERVER_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(SERVER_STATUS_EVENT, onStatus);
  }, [ready, refreshContext]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const resolvedTheme: 'light' | 'dark' = useMemo(() => {
    if (settings.theme === 'dark') return 'dark';
    if (settings.theme === 'light') return 'light';
    return systemDark ? 'dark' : 'light';
  }, [settings.theme, systemDark]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  const updateSettings = useCallback(async (patch: Partial<Settings>) => {
    const updated = await api.updateSettings(patch);
    setSettings(updated);
  }, []);

  const formatAmount = useCallback(
    (cents: Money, opts?: { showSign?: boolean }) =>
      formatMoney(cents, settings.currencyCode, settings.locale, opts),
    [settings.currencyCode, settings.locale]
  );

  const formatCompact = useCallback(
    (cents: Money) =>
      formatCompactMoney(cents, settings.currencyCode, settings.locale),
    [settings.currencyCode, settings.locale]
  );

  const formatDate = useCallback(
    (iso: ISODate | null | undefined) => formatDisplayDate(iso, settings.dateFormat),
    [settings.dateFormat]
  );

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, variant: ToastVariant = 'success') => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    setToasts((prev) => [...prev, { id, message, variant }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
  }, []);

  // Pages load data with try/finally; surface any API error they don't catch as a toast.
  useEffect(() => {
    const onUnhandled = (e: PromiseRejectionEvent) => {
      if (!(e.reason instanceof ApiError)) return;
      e.preventDefault();
      if (!e.reason.isNetworkError) toast(e.reason.message, 'error');
    };
    window.addEventListener('unhandledrejection', onUnhandled);
    return () => window.removeEventListener('unhandledrejection', onUnhandled);
  }, [toast]);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({ options, resolve });
    });
  }, []);

  const resolveConfirm = useCallback((value: boolean) => {
    setConfirmState((prev) => {
      if (prev) prev.resolve(value);
      return null;
    });
  }, []);

  const value: AppContextValue = {
    settings,
    ready,
    serverOnline,
    initialLoadError,
    resolvedTheme,
    refreshContext,
    updateSettings,
    formatAmount,
    formatCompact,
    formatDate,
    toast,
    dismissToast,
    toasts,
    confirm,
    confirmState,
    resolveConfirm,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
