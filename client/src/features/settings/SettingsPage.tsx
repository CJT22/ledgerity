import {
  Archive,
  Download,
  FileJson,
  FileSpreadsheet,
  HardDriveDownload,
  History,
  Info,
  RotateCcw,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../api';
import { Card, StatCard, ThemeToggle } from '../../components';
import { useApp } from '../../context/AppContext';
import { formatDisplayDate, formatMoney, todayISODate } from '@shared/domain';
import { BackupInfo, SystemInfo, WeekendRule } from '@shared/types';

const CURRENCIES = [
  { code: 'PHP', locale: 'en-PH', label: 'PHP — Philippine Peso (₱)' },
  { code: 'USD', locale: 'en-US', label: 'USD — US Dollar ($)' },
  { code: 'EUR', locale: 'en-IE', label: 'EUR — Euro (€)' },
  { code: 'GBP', locale: 'en-GB', label: 'GBP — British Pound (£)' },
  { code: 'JPY', locale: 'ja-JP', label: 'JPY — Japanese Yen (¥)' },
  { code: 'SGD', locale: 'en-SG', label: 'SGD — Singapore Dollar (S$)' },
];

const DATE_FORMATS = [
  { format: 'MMM d, yyyy', label: 'MMM d, yyyy (Nov 24, 2026)' },
  { format: 'yyyy-MM-dd', label: 'yyyy-MM-dd (2026-11-24)' },
  { format: 'dd/MM/yyyy', label: 'dd/MM/yyyy (24/11/2026)' },
  { format: 'MM/dd/yyyy', label: 'MM/dd/yyyy (11/24/2026)' },
];

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const SettingsPage: React.FC = () => {
  const { settings, updateSettings, refreshContext, toast, confirm } = useApp();

  const [cutoffInput, setCutoffInput] = useState(settings.cutoffDays.join(', '));
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const today = todayISODate();
  const persistent = api.isPersistent;

  const [backups, setBackups] = useState<BackupInfo[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // Keep the cutoff text box in sync when settings change elsewhere (restore, reset, ...)
  const cutoffKey = settings.cutoffDays.join(', ');
  useEffect(() => setCutoffInput(cutoffKey), [cutoffKey]);

  const loadDataInfo = useCallback(async () => {
    if (!persistent) return;
    const [list, info] = await Promise.all([api.listBackups(), api.getSystemInfo()]);
    setBackups(list);
    setSystemInfo(info);
  }, [persistent]);

  useEffect(() => {
    void loadDataInfo();
  }, [loadDataInfo]);

  /** Runs a data action with a busy flag, refreshing everything afterwards. */
  const runDataAction = async (key: string, action: () => Promise<unknown>, successMsg: string) => {
    setBusy(key);
    try {
      await action();
      await refreshContext();
      await loadDataInfo();
      toast(successMsg);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Something went wrong', 'error');
    } finally {
      setBusy(null);
    }
  };

  const safetyNote = persistent
    ? ' A safety backup of your current data is saved first, so this can be undone from the Backups list.'
    : '';

  const handleCurrencyChange = async (code: string) => {
    const match = CURRENCIES.find((c) => c.code === code);
    await updateSettings({
      currencyCode: code,
      locale: match?.locale ?? settings.locale,
    });
    toast(`Currency updated to ${code}`);
  };

  const handleSaveCutoffs = async () => {
    const nums = cutoffInput
      .split(',')
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => !Number.isNaN(n) && n >= 1 && n <= 31);
    if (nums.length === 0) {
      toast('Enter valid day numbers (1–31)', 'error');
      return;
    }
    const sorted = Array.from(new Set(nums)).sort((a, b) => a - b);
    await updateSettings({ cutoffDays: sorted });
    setCutoffInput(sorted.join(', '));
    toast('Cutoff days saved');
  };

  const handleExportJson = async () => {
    const json = await api.exportBackup();
    triggerDownload(`ledgerity-export-${today}.json`, json, 'application/json');
    toast('JSON export downloaded');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    const ok = await confirm({
      title: 'Import this file?',
      message: `"${file.name}" will REPLACE all current data.${safetyNote}`,
      confirmLabel: 'Import & replace',
      destructive: true,
    });
    if (!ok) return;
    const text = await file.text();
    await runDataAction('import', () => api.importBackup(text), 'Data imported');
  };

  const handleExportCsv = async () => {
    const csv = await api.exportExpensesCsv();
    triggerDownload(`ledgerity-expenses-${today}.csv`, csv, 'text/csv;charset=utf-8;');
    toast('Expenses & payments CSV downloaded');
  };

  const handleBackupNow = () => runDataAction('backup', () => api.createBackup(), 'Backup saved');

  const handleRestore = async (b: BackupInfo) => {
    const ok = await confirm({
      title: 'Restore this backup?',
      message: `All current data will be replaced with the backup from ${new Date(b.createdAt).toLocaleString()}.${safetyNote}`,
      confirmLabel: 'Restore backup',
      destructive: true,
    });
    if (!ok) return;
    await runDataAction(`restore:${b.fileName}`, () => api.restoreBackup(b.fileName), 'Backup restored');
  };

  const handleResetDemo = async () => {
    const ok = await confirm({
      title: 'Load demo data?',
      message: `This REPLACES all current data with the sample expenses, plans and projections.${safetyNote}`,
      confirmLabel: 'Load demo data',
      destructive: true,
    });
    if (!ok) return;
    await runDataAction('demo', () => api.resetDemoData(), 'Demo data loaded');
  };

  const handleClearAll = async () => {
    const ok = await confirm({
      title: 'Erase all data?',
      message: `Deletes every expense, payment and projection. Your display settings are kept.${safetyNote}`,
      confirmLabel: 'Erase everything',
      destructive: true,
    });
    if (!ok) return;
    await runDataAction('clear', () => api.clearAllData(), 'All data erased. Fresh start!');
  };

  const handleLanToggle = async (lanAccess: boolean) => {
    await updateSettings({ lanAccess });
    await loadDataInfo();
    toast('Saved. Restart Ledgerity for this to take effect.', 'info');
  };

  const kindLabel: Record<BackupInfo['kind'], string> = {
    auto: 'Daily',
    manual: 'Manual',
    'pre-restore': 'Safety',
  };
  const formatSize = (bytes: number) =>
    bytes >= 1024 * 1024
      ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
      : `${Math.max(1, Math.round(bytes / 1024))} KB`;

  const btn =
    'inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50';
  const dangerBtn =
    'inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50';

  /** Phone URL uses the port the UI is actually served on (5173 in dev, 5174 with npm start). */
  const phoneUrl = (u: string) => {
    const port = window.location.port;
    return port ? u.replace(/:\d+$/, `:${port}`) : u;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
          Settings
        </h1>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Configure formatting, cutoff paydays, projection horizon, and local data backups
        </p>
      </div>

      {/* Stat Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Currency Preview"
          value={formatMoney(1250000, settings.currencyCode, settings.locale)}
          subtext={`${settings.currencyCode} · ${settings.locale}`}
        />
        <StatCard
          label="Date Preview"
          value={formatDisplayDate(today, settings.dateFormat)}
          subtext={settings.dateFormat}
        />
        <StatCard
          label="Cutoff Paydays"
          value={settings.cutoffDays.join(' & ')}
          subtext={
            settings.defaultWeekendRule === 'none'
              ? 'exact date, even on weekends'
              : settings.defaultWeekendRule.replace(/_/g, ' ')
          }
        />
        <StatCard
          label="Upcoming Horizon"
          value={`${settings.upcomingHorizonMonths} mo`}
          subtext="Used for open-ended recurring parts"
        />
      </div>

      {/* Formatting & Preferences */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Display &amp; Locale
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Currency
            </label>
            <select
              value={settings.currencyCode}
              onChange={(e) => void handleCurrencyChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Live preview:{' '}
              <span className="font-mono-num font-semibold text-slate-700 dark:text-slate-200">
                {formatMoney(1250000, settings.currencyCode, settings.locale)}
              </span>
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Date Format
            </label>
            <select
              value={settings.dateFormat}
              onChange={(e) => {
                void updateSettings({ dateFormat: e.target.value });
                toast('Date format updated');
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              {DATE_FORMATS.map((df) => (
                <option key={df.format} value={df.format}>
                  {df.label}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
              Live preview:{' '}
              <span className="font-semibold text-slate-700 dark:text-slate-200">
                {formatDisplayDate(today, settings.dateFormat)}
              </span>
            </p>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Theme
            </div>
            <ThemeToggle />
          </div>
        </Card>

        <Card className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Schedule &amp; Cutoff Rules
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Cutoff Days (comma-separated)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={cutoffInput}
                onChange={(e) => setCutoffInput(e.target.value)}
                placeholder="10, 25"
                className="flex-1 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleSaveCutoffs()}
                className="px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700"
              >
                Apply
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
              Default Weekend Rule
            </label>
            <select
              value={settings.defaultWeekendRule}
              onChange={(e) => {
                void updateSettings({ defaultWeekendRule: e.target.value as WeekendRule });
                toast('Default weekend rule updated');
              }}
              className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="none">Keep exact weekend date</option>
              <option value="next_business_day">Next business day (Sat/Sun → Monday after)</option>
              <option value="previous_business_day">
                Previous business day (Sat/Sun → Friday before)
              </option>
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Upcoming Horizon (months)
              </label>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.upcomingHorizonMonths}
                onChange={(e) =>
                  void updateSettings({
                    upcomingHorizonMonths: Math.max(1, Math.min(60, Number(e.target.value) || 12)),
                  })
                }
                className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm font-mono-num tabular-nums text-slate-900 dark:text-slate-100"
              />
            </div>

          </div>
        </Card>
      </div>

      {/* Network (phone access) */}
      {persistent && (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <Smartphone className="w-5 h-5 mt-0.5 text-slate-500 dark:text-slate-400" />
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Phone access (same Wi-Fi)
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xl">
                  Lets other devices on your network open Ledgerity. There is no login, so anyone
                  on your Wi-Fi with the address can see and change your data. Turn this off on
                  shared or public networks.
                </p>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.lanAccess}
                onChange={(e) => void handleLanToggle(e.target.checked)}
                className="w-4 h-4 accent-emerald-600"
              />
              {settings.lanAccess ? 'On' : 'Off'}
            </label>
          </div>

          {systemInfo && systemInfo.lanAccess !== systemInfo.lanAccessActive && (
            <p className="text-xs rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 px-3 py-2">
              Restart Ledgerity (close its terminal window and run <code>npm start</code> again) to
              turn phone access {systemInfo.lanAccess ? 'on' : 'off'}.
            </p>
          )}

          {systemInfo?.lanAccessActive && (
            <div className="text-xs text-slate-600 dark:text-slate-400">
              {systemInfo.lanUrls.length > 0 ? (
                <>
                  Open on your phone:{' '}
                  {systemInfo.lanUrls.map((u) => (
                    <code
                      key={u}
                      className="font-mono-num font-semibold text-slate-800 dark:text-slate-200 mr-3"
                    >
                      {phoneUrl(u)}
                    </code>
                  ))}
                  <span className="block mt-1 text-[11px]">
                    If it doesn't load, allow Node.js through Windows Firewall for private networks.
                  </span>
                </>
              ) : (
                'No network connection detected on this PC.'
              )}
            </div>
          )}
        </Card>
      )}

      {/* Backups */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <History className="w-5 h-5 mt-0.5 text-slate-500 dark:text-slate-400" />
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Backups</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {persistent
                  ? 'Copies of your SQLite database. One is made automatically each day (last 14 kept), plus a safety copy before any restore, import, reset or erase.'
                  : 'Demo mode: data lives in this browser only. Run the Ledgerity server for SQLite backups.'}
              </p>
            </div>
          </div>
          {persistent && (
            <button
              type="button"
              onClick={() => void handleBackupNow()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50"
            >
              <Archive className="w-4 h-4" />
              {busy === 'backup' ? 'Saving…' : 'Backup now'}
            </button>
          )}
        </div>

        {persistent && (
          <div className="overflow-x-auto">
            {backups.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">No backups yet.</p>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                    <th className="py-2 pr-3 font-medium">Saved</th>
                    <th className="py-2 pr-3 font-medium">Type</th>
                    <th className="py-2 pr-3 font-medium text-right">Size</th>
                    <th className="py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.slice(0, 30).map((b) => {
                    const url = api.backupDownloadUrl(b.fileName);
                    return (
                      <tr
                        key={b.fileName}
                        className="border-b border-slate-100 dark:border-slate-800/60 last:border-0"
                      >
                        <td className="py-2 pr-3 text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {new Date(b.createdAt).toLocaleString(settings.locale, {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </td>
                        <td className="py-2 pr-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                              b.kind === 'manual'
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                                : b.kind === 'pre-restore'
                                  ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300'
                                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                          >
                            {kindLabel[b.kind]}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-right font-mono-num text-slate-600 dark:text-slate-400">
                          {formatSize(b.sizeBytes)}
                        </td>
                        <td className="py-2 text-right whitespace-nowrap">
                          {url && (
                            <a
                              href={url}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                              title="Download this .sqlite file"
                            >
                              <HardDriveDownload className="w-3.5 h-3.5" />
                              <span className="hidden sm:inline">Download</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleRestore(b)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            {busy === `restore:${b.fileName}` ? 'Restoring…' : 'Restore'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>

      {/* Export / import / danger zone */}
      <Card className="space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Export &amp; import
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            JSON is a portable copy of everything, handy for moving data or keeping an extra
            backup. CSV opens in Excel or Google Sheets.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void handleExportJson()} className={btn}>
            <FileJson className="w-4 h-4" />
            <span>Export JSON</span>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            onChange={(e) => void handleImportFile(e)}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
            className={btn}
          >
            <Upload className="w-4 h-4" />
            <span>{busy === 'import' ? 'Importing…' : 'Import JSON'}</span>
          </button>

          <button type="button" onClick={() => void handleExportCsv()} className={btn}>
            <FileSpreadsheet className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-rose-600 dark:text-rose-400 mr-auto">
            Danger zone
          </span>
          <button
            type="button"
            onClick={() => void handleResetDemo()}
            disabled={busy !== null}
            className={dangerBtn}
          >
            <Download className="w-4 h-4" />
            <span>{busy === 'demo' ? 'Loading…' : 'Load demo data'}</span>
          </button>
          <button
            type="button"
            onClick={() => void handleClearAll()}
            disabled={busy !== null}
            className={dangerBtn}
          >
            <Trash2 className="w-4 h-4" />
            <span>{busy === 'clear' ? 'Erasing…' : 'Erase all data'}</span>
          </button>
        </div>
      </Card>

      {/* About */}
      <Card className="space-y-3">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 mt-0.5 text-slate-500 dark:text-slate-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              About Ledgerity
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Local-first expense tracking and funds projection. Open source under the MIT license.
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-1 sm:grid-cols-[10rem_1fr] gap-x-4 gap-y-2 text-xs">
          <dt className="text-slate-500 dark:text-slate-400">Version</dt>
          <dd className="font-mono-num font-semibold text-slate-900 dark:text-slate-100">
            v{__APP_VERSION__}
          </dd>
          {systemInfo ? (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Database schema</dt>
              <dd className="font-mono-num text-slate-700 dark:text-slate-300">
                v{systemInfo.schemaVersion}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">Data folder</dt>
              <dd className="font-mono-num text-slate-700 dark:text-slate-300 break-all">
                {systemInfo.dataDir}
              </dd>
              <dt className="text-slate-500 dark:text-slate-400">Database file</dt>
              <dd className="font-mono-num text-slate-700 dark:text-slate-300 break-all">
                {systemInfo.databaseFile}
              </dd>
            </>
          ) : (
            <>
              <dt className="text-slate-500 dark:text-slate-400">Storage</dt>
              <dd className="text-slate-700 dark:text-slate-300">
                Demo mode: this browser only
              </dd>
            </>
          )}
        </dl>
      </Card>
    </div>
  );
};
