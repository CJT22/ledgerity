import { GitCompare } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../../api';
import { Card, DataTable, EmptyState } from '../../components';
import { useApp } from '../../context/AppContext';
import { formatShortDate } from '@shared/domain';
import { ProjectionComparison, ProjectionResult } from '@shared/types';

const COMPARE_COLORS = ['#10b981', '#8b5cf6', '#f59e0b'];

export const ScenarioComparePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatAmount, formatCompact, formatDate, resolvedTheme } = useApp();

  const [allProjections, setAllProjections] = useState<ProjectionResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<ProjectionComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void api.getProjections().then((list) => {
      setAllProjections(list);
      const paramIds = (searchParams.get('ids') ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const initial =
        paramIds.length >= 2
          ? paramIds.slice(0, 3)
          : list.slice(0, Math.min(3, list.length)).map((p) => p.projection.id);
      setSelectedIds(initial);
    });
  }, [searchParams]);

  useEffect(() => {
    if (selectedIds.length === 0) {
      setComparison(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    void api
      .compareProjections(selectedIds)
      .then(setComparison)
      .finally(() => setLoading(false));
  }, [selectedIds]);

  const toggleId = (id: string) => {
    setSelectedIds((prev) => {
      const next = prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev;
      setSearchParams({ ids: next.join(',') }, { replace: true });
      return next;
    });
  };

  const isDark = resolvedTheme === 'dark';
  const gridStroke = isDark ? '#1e293b' : '#e2e8f0';
  const axisTickColor = isDark ? '#94a3b8' : '#64748b';

  const chartData =
    comparison?.mergedTimeline.map((pt) => {
      const obj: Record<string, string | number> = { date: pt.date };
      for (const proj of comparison.projections) {
        obj[proj.projection.id] = (pt.values[proj.projection.id] ?? 0) / 100;
      }
      return obj;
    }) ?? [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">
            <Link to="/projections" className="hover:underline">
              Projections
            </Link>{' '}
            / <span>Compare Scenarios</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Scenario Comparison
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Compare 2–3 projections side by side against the first selected baseline
          </p>
        </div>
      </div>

      {/* Selector */}
      <Card>
        <div className="text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
          Selected Projections (up to 3; first acts as baseline)
        </div>
        <div className="flex flex-wrap gap-2">
          {allProjections.map((p) => {
            const idx = selectedIds.indexOf(p.projection.id);
            const active = idx >= 0;
            return (
              <button
                key={p.projection.id}
                type="button"
                onClick={() => toggleId(p.projection.id)}
                className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-slate-900 dark:bg-slate-800 text-white border-transparent'
                    : 'bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
                }`}
              >
                {active && (
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: COMPARE_COLORS[idx % COMPARE_COLORS.length] }}
                  />
                )}
                <span>{p.projection.name}</span>
                {idx === 0 && (
                  <span className="text-[10px] opacity-75">(Baseline)</span>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {loading ? (
        <div className="h-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
      ) : !comparison || comparison.projections.length < 2 ? (
        <EmptyState
          icon={<GitCompare className="w-5 h-5" />}
          title="Select at least 2 projections"
          description="Pick 2 or 3 projections above to overlay their balance curves and compare outcomes."
        />
      ) : (
        <>
          <Card>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              Overlaid Balance Curves
            </h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => formatShortDate(String(v))}
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    minTickGap={30}
                  />
                  <YAxis
                    tickFormatter={(v) => formatCompact(Math.round(Number(v) * 100))}
                    tick={{ fontSize: 11, fill: axisTickColor }}
                    width={64}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: isDark ? '#0f172a' : '#ffffff',
                      borderColor: isDark ? '#334155' : '#e2e8f0',
                      borderRadius: '0.75rem',
                      fontSize: '12px',
                    }}
                    labelFormatter={(l) => formatDate(String(l))}
                    formatter={(val, name) => [
                      formatAmount(Math.round(Number(val) * 100)),
                      String(name),
                    ]}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <ReferenceLine y={0} stroke="#ef4444" strokeOpacity={0.5} />
                  {comparison.projections.map((p, idx) => (
                    <Line
                      key={p.projection.id}
                      type="monotone"
                      dataKey={p.projection.id}
                      name={p.projection.name}
                      stroke={COMPARE_COLORS[idx % COMPARE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <DataTable
            rows={comparison.metrics}
            getRowKey={(m) => m.projectionId}
            columns={[
              {
                key: 'name',
                header: 'Projection',
                render: (m) => (
                  <Link
                    to={`/projections/${m.projectionId}`}
                    className="font-semibold text-slate-900 dark:text-slate-100 hover:text-emerald-600"
                  >
                    {m.name}
                    {m.projectionId === comparison.baselineId && (
                      <span className="ml-2 text-[11px] font-normal text-slate-400">
                        (Baseline)
                      </span>
                    )}
                  </Link>
                ),
              },
              {
                key: 'endBalance',
                header: 'End Balance',
                align: 'right',
                render: (m) => (
                  <span className="font-mono-num tabular-nums font-semibold">
                    {formatAmount(m.endBalance)}
                  </span>
                ),
              },
              {
                key: 'diff',
                header: 'Diff vs Baseline',
                align: 'right',
                render: (m) => {
                  if (m.projectionId === comparison.baselineId) {
                    return <span className="text-xs text-slate-400">—</span>;
                  }
                  return (
                    <span
                      className={`font-mono-num tabular-nums font-semibold ${
                        m.endBalanceDiff > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : m.endBalanceDiff < 0
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-500'
                      }`}
                    >
                      {formatAmount(m.endBalanceDiff, { showSign: true })}
                    </span>
                  );
                },
              },
              {
                key: 'lowest',
                header: 'Lowest Point',
                align: 'right',
                render: (m) => (
                  <span
                    className={`font-mono-num tabular-nums ${
                      m.lowestBalance < 0
                        ? 'text-rose-600 dark:text-rose-400 font-semibold'
                        : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {formatAmount(m.lowestBalance)} ({formatShortDate(m.lowestBalanceDate)})
                  </span>
                ),
              },
              {
                key: 'in',
                header: 'Total In',
                align: 'right',
                render: (m) => (
                  <span className="font-mono-num tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{formatAmount(m.totalIn)}
                  </span>
                ),
              },
              {
                key: 'out',
                header: 'Total Out',
                align: 'right',
                render: (m) => (
                  <span className="font-mono-num tabular-nums text-rose-600 dark:text-rose-400">
                    −{formatAmount(m.totalOut)}
                  </span>
                ),
              },
            ]}
          />
        </>
      )}
    </div>
  );
};
