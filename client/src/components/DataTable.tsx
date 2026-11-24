import React from 'react';

export interface DataTableColumn<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  className?: string;
  hideOnMobile?: boolean;
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  rows: T[];
  columns: DataTableColumn<T>[];
  getRowKey: (row: T) => string;
  getRowClassName?: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyState?: React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  getRowKey,
  getRowClassName,
  onRowClick,
  emptyState,
}: DataTableProps<T>) {
  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`px-3.5 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap ${
                    col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left'
                  } ${col.className ?? ''}`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {rows.map((row) => {
              const key = getRowKey(row);
              const extraClass = getRowClassName ? getRowClassName(row) : '';
              return (
                <tr
                  key={key}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  tabIndex={onRowClick ? 0 : undefined}
                  onKeyDown={
                    onRowClick
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onRowClick(row);
                          }
                        }
                      : undefined
                  }
                  className={`transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                    onRowClick ? 'cursor-pointer focus-visible:outline-none focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800' : ''
                  } ${extraClass}`}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-3.5 py-2.5 align-middle ${
                        col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left'
                      } ${col.className ?? ''}`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Stacked Cards */}
      <div className="md:hidden flex flex-col gap-2.5">
        {rows.map((row) => {
          const key = getRowKey(row);
          const extraClass = getRowClassName ? getRowClassName(row) : '';
          return (
            <div
              key={key}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={`rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2 ${extraClass}`}
            >
              {columns
                .filter((c) => !c.hideOnMobile)
                .map((col) => (
                  <div key={col.key} className="flex items-start justify-between gap-3 text-xs">
                    <span className="text-slate-500 dark:text-slate-400 shrink-0">
                      {col.header}
                    </span>
                    <div className="text-right font-medium text-slate-900 dark:text-slate-100 min-w-0">
                      {col.render(row)}
                    </div>
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
