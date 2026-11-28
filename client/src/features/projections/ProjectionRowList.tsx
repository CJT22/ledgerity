import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import {
  CalendarCog,
  ChevronDown,
  ChevronRight,
  Edit3,
  ExternalLink,
  EyeOff,
  MoreHorizontal,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { formatDisplayDate } from '@shared/domain';
import { CutoffPeriodGroup, ISODate, Money, ProjectionRow } from '@shared/types';
import { Card } from '../../components';

export type RowFilter = 'all' | 'add' | 'minus';

export interface RowHandlers {
  onEditOccurrence: (row: ProjectionRow) => void;
  onEditSeries: (itemId: string) => void;
  onDeleteSeries: (itemId: string) => void;
  onToggleExclusion: (row: ProjectionRow) => void;
  onDeleteCheckpoint: (checkpointId: string) => void;
}

interface SharedProps {
  handlers: RowHandlers;
  filter: RowFilter;
  formatAmount: (cents: Money, opts?: { showSign?: boolean }) => string;
}

export const matchesFilter = (row: ProjectionRow, filter: RowFilter) =>
  filter === 'all' || row.type === filter;

const shortDate = (iso: ISODate) => formatDisplayDate(iso, 'MMM d');
const dayHeading = (iso: ISODate) => formatDisplayDate(iso, 'EEE, MMM d');

// ---------------------------------------------------------------------------
// ⋯ menu (rendered in a portal with fixed positioning so cards can't clip it)
// ---------------------------------------------------------------------------

interface MenuItem {
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
  to?: string;
}

const RowMenu: React.FC<{ items: MenuItem[]; label: string }> = ({ items, label }) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 40 * items.length + 24;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (
        e instanceof MouseEvent &&
        (menuRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node))
      )
        return;
      setOpen(false);
    };
    const closeNow = () => setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('scroll', closeNow, true);
    window.addEventListener('resize', closeNow);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('scroll', closeNow, true);
      window.removeEventListener('resize', closeNow);
    };
  }, [open]);

  if (items.length === 0) return <span className="w-7" />;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`w-7 h-7 inline-flex items-center justify-center rounded-md text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 ${
          open ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100' : ''
        }`}
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{
              position: 'fixed',
              right: pos.right,
              ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            }}
            className="z-50 min-w-44 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
          >
            {items.map((it) => {
              const cls = `w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left ${
                it.destructive
                  ? 'text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40'
                  : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`;
              return it.to ? (
                <Link key={it.label} role="menuitem" to={it.to} className={cls} onClick={() => setOpen(false)}>
                  {it.icon}
                  <span>{it.label}</span>
                </Link>
              ) : (
                <button
                  key={it.label}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setOpen(false);
                    it.onSelect();
                  }}
                >
                  {it.icon}
                  <span>{it.label}</span>
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};

const icon = (C: typeof Edit3) => <C className="w-3.5 h-3.5 shrink-0" />;

const seriesMenu = (itemId: string, h: RowHandlers): MenuItem[] => [
  { label: 'Edit series', icon: icon(Edit3), onSelect: () => h.onEditSeries(itemId) },
  { label: 'Delete series', icon: icon(Trash2), onSelect: () => h.onDeleteSeries(itemId), destructive: true },
];

const rowMenu = (row: ProjectionRow, h: RowHandlers, includeSeries = true): MenuItem[] => {
  if (row.source === 'item' && row.itemId) {
    return [
      { label: 'Edit this date', icon: icon(CalendarCog), onSelect: () => h.onEditOccurrence(row) },
      ...(includeSeries ? seriesMenu(row.itemId, h) : []),
    ];
  }
  if (row.isLinkedFromExpense) {
    return [
      row.excluded
        ? { label: 'Include again', icon: icon(RotateCcw), onSelect: () => h.onToggleExclusion(row) }
        : { label: 'Exclude from projection', icon: icon(EyeOff), onSelect: () => h.onToggleExclusion(row) },
      ...(row.linkedExpenseId
        ? [{ label: 'Open expense', icon: icon(ExternalLink), onSelect: () => {}, to: `/expenses/${row.linkedExpenseId}` }]
        : []),
    ];
  }
  if (row.source === 'checkpoint' && row.checkpointId) {
    const id = row.checkpointId;
    return [{ label: 'Remove checkpoint', icon: icon(Trash2), onSelect: () => h.onDeleteCheckpoint(id), destructive: true }];
  }
  return [];
};

// ---------------------------------------------------------------------------
// Row pieces
// ---------------------------------------------------------------------------

const isMuted = (row: ProjectionRow) => row.skipped || row.excluded;

const signedAmount = (row: ProjectionRow, fmt: SharedProps['formatAmount']) =>
  row.type === 'adjustment'
    ? fmt(row.effectiveAmount, { showSign: true })
    : `${row.type === 'add' ? '+' : '−'}${fmt(row.skipped ? row.plannedAmount : row.effectiveAmount)}`;

const amountClass = (row: ProjectionRow) =>
  isMuted(row)
    ? 'text-slate-400 line-through'
    : row.type === 'add' || (row.type === 'adjustment' && row.effectiveAmount > 0)
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';

const Tag: React.FC<{ tone: 'amber' | 'emerald' | 'slate'; children: React.ReactNode; title?: string }> = ({
  tone,
  children,
  title,
}) => (
  <span
    title={title}
    className={`inline-flex items-center px-1.5 rounded text-[10px] font-medium leading-4 ${
      tone === 'amber'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
        : tone === 'emerald'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
    }`}
  >
    {children}
  </span>
);

const RowTags: React.FC<{ row: ProjectionRow }> = ({ row }) => (
  <>
    {row.isLinkedFromExpense && <Tag tone="amber" title={row.linkedExpenseName}>Expenses</Tag>}
    {row.paid && <Tag tone="emerald">Paid</Tag>}
    {row.edited && !row.skipped && <Tag tone="slate" title="Changed for this date only">Edited</Tag>}
    {row.skipped && !row.isLinkedFromExpense && <Tag tone="slate">Skipped</Tag>}
    {row.excluded && <Tag tone="slate">Excluded</Tag>}
  </>
);

const Balance: React.FC<{ value: Money; fmt: SharedProps['formatAmount'] }> = ({ value, fmt }) => (
  <span
    className={`font-mono-num tabular-nums ${
      value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'
    }`}
  >
    {fmt(value)}
  </span>
);

/** Columns (md+): expander · date · item · amount · balance · menu */
const CUTOFF_GRID =
  'grid grid-cols-[1rem_minmax(0,1fr)_auto_1.75rem] md:grid-cols-[1rem_7.5rem_minmax(0,1fr)_8.5rem_8.5rem_1.75rem] items-center gap-x-3 px-4';

const CutoffRow: React.FC<
  SharedProps & { row: ProjectionRow; child?: boolean; inSeriesGroup?: boolean }
> = ({ row, child, inSeriesGroup, handlers, formatAmount }) => (
  <div
    className={`${CUTOFF_GRID} py-1.5 text-xs ${
      row.isLinkedFromExpense && !row.excluded ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
    }`}
  >
    <span />
    <span className={`hidden md:block font-mono-num tabular-nums ${isMuted(row) ? 'text-slate-400 line-through' : 'text-slate-600 dark:text-slate-400'}`}>
      {shortDate(row.effectiveDate)}
    </span>
    <div className={`min-w-0 ${child ? 'pl-3 border-l border-slate-200 dark:border-slate-700' : ''}`}>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="md:hidden font-mono-num text-slate-500 dark:text-slate-400">{shortDate(row.effectiveDate)}</span>
        {!child && (
          <span className={`font-medium truncate ${isMuted(row) ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
            {row.name}
          </span>
        )}
        <RowTags row={row} />
      </div>
      {row.note && <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{row.note}</div>}
      <div className="md:hidden text-[11px] text-slate-500 dark:text-slate-400">
        Balance <Balance value={row.runningTotal} fmt={formatAmount} />
      </div>
    </div>
    <span className={`text-right font-mono-num tabular-nums font-semibold whitespace-nowrap ${amountClass(row)}`}>
      {signedAmount(row, formatAmount)}
    </span>
    <span className="hidden md:block text-right whitespace-nowrap">
      <Balance value={row.runningTotal} fmt={formatAmount} />
    </span>
    <span className="flex justify-end">
      <RowMenu items={rowMenu(row, handlers, !inSeriesGroup)} label={`Actions for ${row.name}`} />
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// By cutoff
// ---------------------------------------------------------------------------

type Entry = { kind: 'row'; row: ProjectionRow } | { kind: 'group'; key: string; rows: ProjectionRow[] };

/** Same item (or same recurring expense part) more than once in a cutoff → one expandable row. */
const groupRepeats = (rows: ProjectionRow[]): Entry[] => {
  const keyOf = (r: ProjectionRow) =>
    r.source === 'item' && r.itemId
      ? `item:${r.itemId}`
      : r.source === 'linked_recurring_part' && r.linkedSourceId
        ? `part:${r.linkedSourceId}`
        : null;
  const buckets = new Map<string, ProjectionRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    if (k) buckets.set(k, [...(buckets.get(k) ?? []), r]);
  }
  const out: Entry[] = [];
  const emitted = new Set<string>();
  for (const r of rows) {
    const k = keyOf(r);
    const bucket = k ? buckets.get(k)! : null;
    if (!k || !bucket || bucket.length < 2) {
      out.push({ kind: 'row', row: r });
    } else if (!emitted.has(k)) {
      emitted.add(k);
      out.push({ kind: 'group', key: k, rows: bucket });
    }
  }
  return out;
};

const RepeatGroup: React.FC<SharedProps & { rows: ProjectionRow[]; expanded: boolean; onToggle: () => void }> = ({
  rows,
  expanded,
  onToggle,
  handlers,
  filter,
  formatAmount,
}) => {
  const first = rows[0];
  const last = rows[rows.length - 1];
  const counted = rows.filter((r) => !isMuted(r));
  const total = counted.reduce((s, r) => s + r.effectiveAmount, 0);
  const allMuted = counted.length === 0;
  const edits = rows.filter((r) => r.edited).length;
  const sign = first.type === 'add' ? '+' : '−';
  const amountCls = allMuted
    ? 'text-slate-400 line-through'
    : first.type === 'add'
      ? 'text-emerald-600 dark:text-emerald-400'
      : 'text-rose-600 dark:text-rose-400';
  const seriesItems =
    first.source === 'item' && first.itemId
      ? seriesMenu(first.itemId, handlers)
      : first.linkedExpenseId
        ? [{ label: 'Open expense', icon: icon(ExternalLink), onSelect: () => {}, to: `/expenses/${first.linkedExpenseId}` }]
        : [];

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onToggle();
          }
        }}
        className={`${CUTOFF_GRID} py-1.5 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
          first.isLinkedFromExpense ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
        }`}
      >
        <span className="text-slate-400">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>
        <span className="hidden md:block font-mono-num tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
          {shortDate(first.effectiveDate)} – {formatDisplayDate(last.effectiveDate, first.effectiveDate.slice(0, 7) === last.effectiveDate.slice(0, 7) ? 'd' : 'MMM d')}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`font-medium truncate ${allMuted ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
              {first.name}
            </span>
            <Tag tone="slate">{rows.length} times</Tag>
            {first.isLinkedFromExpense && <Tag tone="amber">Expenses</Tag>}
            {edits > 0 && <Tag tone="slate" title="Dates changed individually">{edits} edited</Tag>}
          </div>
          <div className="md:hidden text-[11px] text-slate-500 dark:text-slate-400 font-mono-num">
            {shortDate(first.effectiveDate)} – {shortDate(last.effectiveDate)}
          </div>
        </div>
        <span className={`text-right font-mono-num tabular-nums font-semibold whitespace-nowrap ${amountCls}`}>
          {sign}
          {formatAmount(allMuted ? rows.reduce((s, r) => s + r.plannedAmount, 0) : total)}
        </span>
        <span className="hidden md:block text-right text-[11px] text-slate-400">
          {counted.length < rows.length ? `${counted.length} of ${rows.length} count` : ''}
        </span>
        <span className="flex justify-end" onClick={(e) => e.stopPropagation()}>
          <RowMenu items={seriesItems} label={`Actions for ${first.name}`} />
        </span>
      </div>
      {expanded && (
        <div className="bg-slate-50/50 dark:bg-slate-950/30">
          {rows.map((r) => (
            <CutoffRow key={r.rowKey} row={r} child inSeriesGroup handlers={handlers} filter={filter} formatAmount={formatAmount} />
          ))}
        </div>
      )}
    </div>
  );
};

export const CutoffList: React.FC<
  SharedProps & {
    groups: CutoffPeriodGroup[];
    today: ISODate;
  }
> = ({ groups, today, handlers, filter, formatAmount }) => {
  // Explicit open/closed choices; otherwise cutoffs that already ended start collapsed.
  const [collapsedOverride, setCollapsedOverride] = useState<Record<string, boolean>>({});
  const [expandedRepeats, setExpandedRepeats] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-3">
      {groups.map((group) => {
        const collapsed = collapsedOverride[group.id] ?? group.endDate < today;
        const isCurrent = group.startDate <= today && today <= group.endDate;
        const visible = group.rows.filter((r) => matchesFilter(r, filter));
        const entries = groupRepeats(visible);
        const maxFlow = Math.max(1, group.totalIn, group.totalOut);

        return (
          <Card key={group.id} padding="none" className="overflow-hidden">
            <button
              type="button"
              onClick={() => setCollapsedOverride((prev) => ({ ...prev, [group.id]: !collapsed }))}
              aria-expanded={!collapsed}
              className="w-full px-4 py-3 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/50 hover:bg-slate-100/70 dark:hover:bg-slate-900 transition-colors text-left"
            >
              <div className="flex items-center gap-2.5">
                {collapsed ? (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {group.label}
                    {isCurrent && <Tag tone="emerald">Now</Tag>}
                    {collapsed && group.rows.length > 0 && (
                      <span className="text-[11px] font-normal text-slate-500 dark:text-slate-400">
                        {group.rows.length} {group.rows.length === 1 ? 'entry' : 'entries'}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono-num">
                    Start {formatAmount(group.startBalance)} → End{' '}
                    <span
                      className={
                        group.endBalance < 0
                          ? 'text-rose-600 dark:text-rose-400 font-semibold'
                          : 'text-slate-900 dark:text-slate-100 font-semibold'
                      }
                    >
                      {formatAmount(group.endBalance)}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="hidden sm:flex flex-col gap-1 w-32">
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${Math.round((group.totalIn / maxFlow) * 100)}%` }} />
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                    <div className="h-full bg-rose-500" style={{ width: `${Math.round((group.totalOut / maxFlow) * 100)}%` }} />
                  </div>
                </div>
                <div className="text-right text-xs font-mono-num tabular-nums">
                  <div className="text-emerald-600 dark:text-emerald-400">+{formatAmount(group.totalIn)}</div>
                  <div className="text-rose-600 dark:text-rose-400">−{formatAmount(group.totalOut)}</div>
                </div>
              </div>
            </button>

            {!collapsed && (
              <div className="border-t border-slate-200 dark:border-slate-800">
                {visible.length === 0 ? (
                  <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                    {group.rows.length === 0 ? 'Nothing scheduled in this cutoff.' : 'Nothing matches this filter.'}
                  </p>
                ) : (
                  <>
                    <div
                      className={`${CUTOFF_GRID} hidden md:grid py-1.5 text-[10px] uppercase tracking-wide font-medium text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800/80`}
                    >
                      <span />
                      <span>Date</span>
                      <span>Item</span>
                      <span className="text-right">Amount</span>
                      <span className="text-right">Balance</span>
                      <span />
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
                      {entries.map((e) => {
                        if (e.kind === 'row') {
                          return (
                            <CutoffRow key={e.row.rowKey} row={e.row} handlers={handlers} filter={filter} formatAmount={formatAmount} />
                          );
                        }
                        const k = `${group.id}::${e.key}`;
                        return (
                          <RepeatGroup
                            key={k}
                            rows={e.rows}
                            expanded={Boolean(expandedRepeats[k])}
                            onToggle={() => setExpandedRepeats((prev) => ({ ...prev, [k]: !prev[k] }))}
                            handlers={handlers}
                            filter={filter}
                            formatAmount={formatAmount}
                          />
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Ledger (chronological, one header per day)
// ---------------------------------------------------------------------------

export const LedgerList: React.FC<SharedProps & { rows: ProjectionRow[]; today: ISODate }> = ({
  rows,
  today,
  handlers,
  filter,
  formatAmount,
}) => {
  // End-of-day balance always comes from every row, whatever the filter shows.
  const endOfDay = new Map<ISODate, Money>();
  for (const r of rows) endOfDay.set(r.effectiveDate, r.runningTotal);

  const days: { date: ISODate; rows: ProjectionRow[] }[] = [];
  for (const r of rows) {
    if (!matchesFilter(r, filter)) continue;
    const last = days[days.length - 1];
    if (last && last.date === r.effectiveDate) last.rows.push(r);
    else days.push({ date: r.effectiveDate, rows: [r] });
  }

  if (days.length === 0) {
    return (
      <Card padding="none">
        <p className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">Nothing matches this filter.</p>
      </Card>
    );
  }

  return (
    <Card padding="none" className="overflow-hidden">
      {days.map((d) => (
        <section key={d.date} className="border-b last:border-b-0 border-slate-200 dark:border-slate-800">
          <div className="flex items-center justify-between gap-3 px-4 py-1.5 bg-slate-50/70 dark:bg-slate-950/50 text-[11px]">
            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-slate-200">
              {dayHeading(d.date)}
              {d.date === today && <Tag tone="emerald">Today</Tag>}
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              End of day <Balance value={endOfDay.get(d.date) ?? 0} fmt={formatAmount} />
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {d.rows.map((row) => (
              <div
                key={row.rowKey}
                className={`grid grid-cols-[minmax(0,1fr)_auto_1.75rem] md:grid-cols-[minmax(0,1fr)_8.5rem_1.75rem] items-center gap-x-3 px-4 py-1.5 text-xs ${
                  row.isLinkedFromExpense && !row.excluded ? 'bg-amber-50/40 dark:bg-amber-950/10' : ''
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium truncate ${isMuted(row) ? 'text-slate-400 line-through' : 'text-slate-900 dark:text-slate-100'}`}>
                      {row.name}
                    </span>
                    <RowTags row={row} />
                  </div>
                  {row.note && <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{row.note}</div>}
                </div>
                <span className={`text-right font-mono-num tabular-nums font-semibold whitespace-nowrap ${amountClass(row)}`}>
                  {signedAmount(row, formatAmount)}
                </span>
                <span className="flex justify-end">
                  <RowMenu items={rowMenu(row, handlers)} label={`Actions for ${row.name}`} />
                </span>
              </div>
            ))}
          </div>
        </section>
      ))}
    </Card>
  );
};
