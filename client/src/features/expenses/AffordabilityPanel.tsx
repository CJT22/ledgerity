import { AlertTriangle, CheckCircle2, CopyPlus, PlusCircle } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { Card, DateInput, MoneyInput } from '../../components';
import { useApp } from '../../context/AppContext';
import { addMonthsISO, todayISODate } from '@shared/domain';
import { AffordabilityResult, ISODate, Money, ProjectionResult } from '@shared/types';

interface AffordabilityPanelProps {
  defaultLabel: string;
  defaultAmount: Money;
}

export const AffordabilityPanel: React.FC<AffordabilityPanelProps> = ({
  defaultLabel,
  defaultAmount,
}) => {
  const { formatAmount, formatDate, toast } = useApp();
  const navigate = useNavigate();

  const [projections, setProjections] = useState<ProjectionResult[]>([]);
  const [projectionId, setProjectionId] = useState('');
  const [date, setDate] = useState<ISODate>(addMonthsISO(todayISODate(), 1));
  const [amount, setAmount] = useState<Money>(defaultAmount);
  const [label, setLabel] = useState(defaultLabel);
  const [result, setResult] = useState<AffordabilityResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    setAmount(defaultAmount);
    setLabel(defaultLabel);
  }, [defaultAmount, defaultLabel]);

  useEffect(() => {
    void api.getProjections().then((list) => {
      setProjections(list);
      const first = list.find((p) => !p.projection.parentProjectionId) ?? list[0];
      if (first) {
        setProjectionId(first.projection.id);
        const suggested = addMonthsISO(todayISODate(), 1);
        setDate(
          suggested >= first.projection.startDate && suggested <= first.projection.endDate
            ? suggested
            : first.projection.startDate
        );
      }
    });
  }, []);

  const selectedProj = projections.find((p) => p.projection.id === projectionId);

  useEffect(() => {
    if (!projectionId || amount <= 0 || !date) {
      setResult(null);
      return;
    }
    let cancelled = false;
    setChecking(true);
    void api
      .checkAffordability({
        projectionId,
        date,
        amount,
        label,
      })
      .then((res) => {
        if (!cancelled) setResult(res);
      })
      .finally(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectionId, date, amount, label]);

  const handleAddToProjection = async () => {
    if (!projectionId || amount <= 0) return;
    setActing(true);
    try {
      await api.createProjectionItem({
        projectionId,
        type: 'minus',
        name: label || 'Planned purchase',
        amount,
        recurrence: {
          freq: 'once',
          interval: 1,
          startDate: date,
          weekendRule: 'none',
        },
      });
      toast('Added purchase to projection');
      navigate(`/projections/${projectionId}`);
    } finally {
      setActing(false);
    }
  };

  const handleCreateScenario = async () => {
    if (!projectionId || amount <= 0) return;
    setActing(true);
    try {
      const base = selectedProj?.projection;
      const scenario = await api.duplicateProjection(
        projectionId,
        `${base?.name ?? 'Projection'} – ${label}`
      );
      await api.createProjectionItem({
        projectionId: scenario.id,
        type: 'minus',
        name: label || 'Planned purchase',
        amount,
        recurrence: {
          freq: 'once',
          interval: 1,
          startDate: date,
          weekendRule: 'none',
        },
      });
      toast('Scenario created with this purchase');
      navigate(`/projections/${scenario.id}`);
    } finally {
      setActing(false);
    }
  };

  if (projections.length === 0) return null;

  return (
    <Card className="border-dashed border-violet-300 dark:border-violet-800">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Can I afford it?
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Test how this planned purchase impacts your projected cashflow before committing.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
            Projection
          </label>
          <select
            value={projectionId}
            onChange={(e) => setProjectionId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
          >
            {projections.map((p) => (
              <option key={p.projection.id} value={p.projection.id}>
                {p.projection.name}
              </option>
            ))}
          </select>
        </div>

        <DateInput
          label="Purchase Date"
          value={date}
          min={selectedProj?.projection.startDate}
          max={selectedProj?.projection.endDate}
          onChange={setDate}
        />

        <MoneyInput label="Amount" value={amount} onChange={setAmount} />
      </div>

      {checking && (
        <div className="text-xs text-slate-500 dark:text-slate-400 py-2">
          Calculating cashflow impact...
        </div>
      )}

      {result && !checking && (
        <div className="space-y-4">
          <div
            className={`rounded-xl border p-4 flex flex-wrap items-center justify-between gap-4 ${
              result.verdict === 'comfortable'
                ? 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/30'
                : result.verdict === 'tight'
                  ? 'border-amber-200 dark:border-amber-900 bg-amber-50/60 dark:bg-amber-950/30'
                  : 'border-rose-200 dark:border-rose-900 bg-rose-50/60 dark:bg-rose-950/30'
            }`}
          >
            <div className="flex items-center gap-2.5">
              {result.verdict === 'comfortable' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertTriangle
                  className={`w-5 h-5 shrink-0 ${
                    result.verdict === 'tight'
                      ? 'text-amber-600 dark:text-amber-400'
                      : 'text-rose-600 dark:text-rose-400'
                  }`}
                />
              )}
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {result.verdict === 'comfortable'
                    ? 'Comfortable — cashflow stays well cushioned'
                    : result.verdict === 'tight'
                      ? 'Tight — balance dips into low buffer territory'
                      : `Goes negative on ${formatDate(result.firstNegativeDate)}`}
                </div>
                <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                  On {formatDate(result.date)}: balance goes from{' '}
                  <span className="font-mono-num tabular-nums font-medium">
                    {formatAmount(result.balanceBeforeOnDate)}
                  </span>{' '}
                  →{' '}
                  <span className="font-mono-num tabular-nums font-medium">
                    {formatAmount(result.balanceAfterOnDate)}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 text-xs">
              <div>
                <div className="text-slate-500 dark:text-slate-400">Lowest afterwards</div>
                <div
                  className={`font-mono-num tabular-nums font-semibold ${
                    result.lowestBalanceAfter < 0
                      ? 'text-rose-600 dark:text-rose-400'
                      : 'text-slate-900 dark:text-slate-100'
                  }`}
                >
                  {formatAmount(result.lowestBalanceAfter)} ({formatDate(result.lowestBalanceAfterDate)})
                </div>
              </div>
              <div>
                <div className="text-slate-500 dark:text-slate-400">End balance</div>
                <div className="font-mono-num tabular-nums font-semibold text-slate-900 dark:text-slate-100">
                  {formatAmount(result.endBalance)}
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => void handleAddToProjection()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>Add to projection</span>
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => void handleCreateScenario()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-lg bg-slate-900 dark:bg-emerald-600 text-white hover:bg-slate-800 dark:hover:bg-emerald-700 disabled:opacity-50"
            >
              <CopyPlus className="w-3.5 h-3.5" />
              <span>Create scenario with this purchase</span>
            </button>
          </div>
        </div>
      )}
    </Card>
  );
};
