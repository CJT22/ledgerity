import { CopyPlus, GitCompare, Plus, Trash2, TrendingUp } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { api } from '../../api';
import { Card, EmptyState, StatCard } from '../../components';
import { useApp } from '../../context/AppContext';
import { ProjectionResult } from '@shared/types';
import { ProjectionFormModal } from './ProjectionFormModal';

export const ProjectionsListPage: React.FC = () => {
  const { formatAmount, formatDate, toast, confirm } = useApp();
  const navigate = useNavigate();

  const [projections, setProjections] = useState<ProjectionResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.getProjections();
      setProjections(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of projections) map.set(p.projection.id, p.projection.name);
    return map;
  }, [projections]);

  const toggleCompare = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 3) {
        toast('Select up to 3 projections to compare', 'info');
        return prev;
      }
      return [...prev, id];
    });
  };

  const handleDuplicate = async (p: ProjectionResult) => {
    const dup = await api.duplicateProjection(
      p.projection.id,
      `${p.projection.name} – Scenario`
    );
    toast('Duplicated as scenario');
    navigate(`/projections/${dup.id}`);
  };

  const handleDelete = async (p: ProjectionResult) => {
    const ok = await confirm({
      title: `Delete "${p.projection.name}"?`,
      message: 'This permanently deletes the projection and its scheduled items.',
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    await api.deleteProjection(p.projection.id);
    setSelectedIds((prev) => prev.filter((x) => x !== p.projection.id));
    toast('Projection deleted');
    void load();
  };

  const baseline = projections.find((p) => !p.projection.parentProjectionId) ?? projections[0];
  const scenarioCount = projections.filter((p) => Boolean(p.projection.parentProjectionId)).length;

  return (
    <div className="space-y-6">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Projections
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Forecast cash balances by cutoff period, reconcile actuals, and test what-if scenarios
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length >= 2 && (
            <button
              type="button"
              onClick={() =>
                navigate(`/projections/compare?ids=${encodeURIComponent(selectedIds.join(','))}`)
              }
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 whitespace-nowrap"
            >
              <GitCompare className="w-4 h-4" />
              <span>Compare ({selectedIds.length})</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            <span>New projection</span>
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Projections & Scenarios"
          value={String(projections.length)}
          subtext={`${scenarioCount} scenario${scenarioCount === 1 ? '' : 's'}`}
        />
        <StatCard
          label={baseline ? `Start (${baseline.projection.name})` : 'Start Balance'}
          value={baseline ? formatAmount(baseline.summary.startTotal) : '—'}
        />
        <StatCard
          label={baseline ? `End (${baseline.projection.name})` : 'End Balance'}
          value={baseline ? formatAmount(baseline.summary.endBalance) : '—'}
          tone={baseline && baseline.summary.endBalance < 0 ? 'negative' : 'positive'}
        />
        <StatCard
          label="Lowest Point (Baseline)"
          value={baseline ? formatAmount(baseline.summary.lowestBalance) : '—'}
          tone={baseline && baseline.summary.lowestBalance < 0 ? 'negative' : 'default'}
          subtext={
            baseline ? `on ${formatDate(baseline.summary.lowestBalanceDate)}` : undefined
          }
        />
      </div>

      {projections.length >= 2 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          Tip: Check 2–3 projections below to compare them side by side.
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map((i) => (
            <div
              key={i}
              className="h-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse"
            />
          ))}
        </div>
      ) : projections.length === 0 ? (
        <EmptyState
          icon={<TrendingUp className="w-5 h-5" />}
          title="No projections yet"
          description="Create a cashflow projection to map paydays, bills, and expense dues."
          actionLabel="New projection"
          onAction={() => setCreateOpen(true)}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projections.map((res) => {
            const p = res.projection;
            const isSelected = selectedIds.includes(p.id);
            const parentName = p.parentProjectionId
              ? projNameMap.get(p.parentProjectionId)
              : null;
            const sparkData = res.timeline
              .filter((_, idx) => idx % Math.max(1, Math.floor(res.timeline.length / 30)) === 0)
              .map((pt) => ({ date: pt.date, total: pt.total / 100 }));

            return (
              <Card
                key={p.id}
                className={`group relative h-full flex flex-col justify-between gap-4 cursor-pointer hover:border-slate-300 dark:hover:border-slate-700 ${
                  isSelected ? 'ring-2 ring-emerald-500 border-emerald-500' : ''
                }`}
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {/* Stretched link: its ::after covers the whole card so any click opens it */}
                      <Link
                        to={`/projections/${p.id}`}
                        className="block truncate text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-emerald-500"
                        title={p.name}
                      >
                        {p.name}
                      </Link>
                      {/* Same structure for every card so values line up across the grid */}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                        {parentName ? (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800 truncate max-w-full">
                            Scenario of {parentName}
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                            Baseline
                          </span>
                        )}
                        <span>
                          {formatDate(p.startDate)} – {formatDate(p.endDate)} · {res.rows.length}{' '}
                          entries
                        </span>
                      </div>
                    </div>

                    <label className="relative z-10 inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCompare(p.id)}
                        className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span>Compare</span>
                    </label>
                  </div>

                  {/* Start -> End + Sparkline */}
                  <div className="mt-4 grid grid-cols-3 gap-3 items-center">
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">Start</div>
                      <div className="text-sm font-semibold font-mono-num tabular-nums text-slate-900 dark:text-slate-100">
                        {formatAmount(res.summary.startTotal)}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">End</div>
                      <div
                        className={`text-sm font-semibold font-mono-num tabular-nums ${
                          res.summary.endBalance < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        {formatAmount(res.summary.endBalance)}
                      </div>
                    </div>
                    <div className="h-12 w-full pointer-events-none">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={sparkData}>
                          <Area
                            type="monotone"
                            dataKey="total"
                            stroke={res.summary.lowestBalance < 0 ? '#ef4444' : '#10b981'}
                            strokeWidth={2}
                            fill={res.summary.lowestBalance < 0 ? '#ef444420' : '#10b98120'}
                            isAnimationActive={false}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Lowest:{' '}
                    <span
                      className={`font-mono-num tabular-nums font-medium ${
                        res.summary.lowestBalance < 0
                          ? 'text-rose-600 dark:text-rose-400'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {formatAmount(res.summary.lowestBalance)}
                    </span>{' '}
                    ({formatDate(res.summary.lowestBalanceDate)})
                  </div>
                  <div className="relative z-10 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void handleDuplicate(res)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      <CopyPlus className="w-3.5 h-3.5" />
                      <span>Duplicate as scenario</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(res)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                      title="Delete projection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ProjectionFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          void load();
          navigate(`/projections/${created.id}`);
        }}
      />
    </div>
  );
};
