import { useMemo, useState, type ReactNode } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { Lock } from 'lucide-react';
import {
  buildStatementComparisonRows,
  type DeltaTone,
  type StatementDisplayRow,
  type StatementKind,
} from '@/engine/financialsAnalytics';
import { cn } from '@/lib/utils';
import type { StatementRowType, StatementTable } from '@/types/financial';
import {
  formatMoneyFull,
  formatNumber,
  formatPercent,
  formatPeriodShort,
  formatPpDelta,
  formatRatio,
  formatThousands,
} from '@/utils/formatters';

interface FinancialStatementTableProps {
  title: string;
  subtitle?: string;
  statementKind: StatementKind;
  activeTable: StatementTable;
  baseTable: StatementTable | null;
  currency: string;
  zeroDate: string;
  selectedPeriod: number;
  isSimulationActive: boolean;
  onSelectPeriod: (periodIdx: number) => void;
  headerExtra?: ReactNode;
}

type UnitMode = 'thousands' | 'full';

const columnHelper = createColumnHelper<StatementDisplayRow>();

function isNegativeValue(rowType: StatementRowType, val: number): boolean {
  if (rowType === 'PCT') return val < -0.0005;
  if (rowType === 'RATIO' || rowType === 'DAYS') return val < -0.005;
  return val < -0.5;
}

function formatCellValue(
  rowType: StatementRowType,
  value: number | null,
  unitMode: UnitMode,
): string {
  if (value === null || !Number.isFinite(value)) return '–';
  if (rowType === 'PCT') return formatPercent(value, 1);
  if (rowType === 'RATIO') return formatRatio(value, 2, 'x');
  if (rowType === 'DAYS') return `${formatNumber(value, 1)} dni`;
  if (rowType === 'CHECK') return formatNumber(value, 2);
  if (unitMode === 'thousands') return formatThousands(value);
  return formatNumber(Math.round(value), 0);
}

function formatDeltaCellValue(
  rowType: StatementRowType,
  delta: number | null,
  unitMode: UnitMode,
): string {
  if (delta === null || !Number.isFinite(delta)) return '–';
  if (rowType === 'PCT') {
    if (Math.abs(delta) < 0.0005) return '–';
    return formatPpDelta(delta, 1);
  }
  if (rowType === 'RATIO') {
    if (Math.abs(delta) < 0.005) return '–';
    return `${delta > 0 ? '+' : ''}${formatNumber(delta, 2)}x`;
  }
  if (rowType === 'DAYS') {
    if (Math.abs(delta) < 0.05) return '–';
    return `${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} d`;
  }
  if (rowType === 'CHECK') {
    return Math.abs(delta) < 0.01 ? '0,00' : formatNumber(delta, 2);
  }
  if (Math.abs(delta) < 1) return '–';
  if (unitMode === 'thousands') {
    const thousands = Math.round(delta / 1000);
    if (thousands === 0) return '0';
    return `${thousands > 0 ? '+' : ''}${formatNumber(thousands, 0)}`;
  }
  return `${delta > 0 ? '+' : ''}${formatNumber(Math.round(delta), 0)}`;
}

function deltaTextClass(tone: DeltaTone, hasChange: boolean): string {
  if (!hasChange) return 'text-[var(--ink-muted)]/60';
  if (tone === 'good') return 'text-emerald-300';
  if (tone === 'bad') return 'text-rose-300';
  return 'text-sky-200';
}

export function FinancialStatementTable({
  title,
  subtitle,
  statementKind,
  activeTable,
  baseTable,
  currency,
  zeroDate,
  selectedPeriod,
  isSimulationActive,
  onSelectPeriod,
  headerExtra,
}: FinancialStatementTableProps) {
  const [unitMode, setUnitMode] = useState<UnitMode>('thousands');

  const periods = activeTable.periodHeaders;
  const multiYear = periods.length > 12;

  const displayRows = useMemo(
    () =>
      buildStatementComparisonRows(
        activeTable,
        baseTable,
        statementKind,
        selectedPeriod,
      ),
    [activeTable, baseTable, statementKind, selectedPeriod],
  );

  const deltaScopeLabel = useMemo(() => {
    if (selectedPeriod >= 0 && selectedPeriod < periods.length) {
      return formatPeriodShort(periods[selectedPeriod], multiYear);
    }
    if (activeTable.hasYearColumn) {
      return statementKind === 'ratios' ? 'Okres' : 'Rok';
    }
    const last = periods[periods.length - 1];
    return last ? formatPeriodShort(last, multiYear) : 'Koniec';
  }, [selectedPeriod, periods, multiYear, activeTable.hasYearColumn, statementKind]);

  const showAmountToggle = statementKind !== 'ratios' || activeTable.rows.some((r) => r.rowType === 'DETAIL');

  const columns = useMemo(() => {
    const labelCol = columnHelper.accessor((d) => d.row.label, {
      id: 'label',
      header: () => (
        <span>
          Pozycja{' '}
          {statementKind !== 'ratios' ? (
            <span className="font-normal text-[var(--ink-muted)]">
              ({unitMode === 'thousands' ? `tys. ${currency}` : currency})
            </span>
          ) : null}
        </span>
      ),
      cell: (info) => {
        const { row } = info.row.original;
        const isBold = row.rowType === 'TOTAL' || row.rowType === 'SUBTOTAL';
        const isPct = row.rowType === 'PCT';
        return (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'truncate',
                isBold
                  ? 'font-semibold text-white'
                  : isPct
                    ? 'pl-3 italic text-[var(--ink-muted)]'
                    : row.rowType === 'CHECK'
                      ? 'font-medium text-sky-200'
                      : 'text-[var(--ink-secondary)]',
              )}
              title={row.label}
            >
              {row.label}
            </span>
          </div>
        );
      },
    });

    const zeroCol = activeTable.hasZeroColumn
      ? [
          columnHelper.accessor((d) => d.row.zeroValue, {
            id: 'zeroValue',
            header: () => (
              <div
                className="inline-flex flex-col items-end"
                title={`Bilans otwarcia z dnia ${zeroDate} (zablokowany w symulacjach What-If)`}
              >
                <span className="inline-flex items-center gap-1 text-sky-200">
                  <Lock className="h-3 w-3" />
                  Moment 0
                </span>
                <span className="text-[10px] font-normal text-[var(--ink-muted)]">
                  {zeroDate}
                </span>
              </div>
            ),
            cell: (info) => {
              const { row, isCheckOk } = info.row.original;
              const val = info.getValue();
              if (row.rowType === 'CHECK') {
                return (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      isCheckOk
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300',
                    )}
                  >
                    {val !== null ? formatNumber(val, 2) : '–'}
                  </span>
                );
              }
              const neg = val !== null && isNegativeValue(row.rowType, val);
              return (
                <span
                  title={val !== null ? formatMoneyFull(val, currency) : undefined}
                  className={cn(neg && 'text-rose-300')}
                >
                  {formatCellValue(row.rowType, val, unitMode)}
                </span>
              );
            },
          }),
        ]
      : [];

    const periodCols = periods.map((hdr, mIdx) =>
      columnHelper.accessor((d) => d.row.months[mIdx] ?? null, {
        id: `m_${mIdx}`,
        header: () => (
          <button
            type="button"
            onClick={() => onSelectPeriod(mIdx)}
            className={cn(
              'cursor-pointer rounded px-1.5 py-0.5 transition hover:text-white',
              selectedPeriod === mIdx && 'bg-sky-500/25 text-sky-200',
            )}
          >
            {formatPeriodShort(hdr, multiYear)}
          </button>
        ),
        cell: (info) => {
          const { row } = info.row.original;
          const val = info.getValue();
          if (row.rowType === 'CHECK') {
            const ok = val !== null && Math.abs(val) <= 0.01;
            return (
              <span
                className={cn(
                  'inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold',
                  ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/20 text-rose-300',
                )}
              >
                {ok ? 'OK' : formatNumber(val ?? 0, 2)}
              </span>
            );
          }
          const neg = val !== null && isNegativeValue(row.rowType, val);
          const titleVal =
            val !== null && (row.rowType === 'DETAIL' || row.rowType === 'SUBTOTAL' || row.rowType === 'TOTAL')
              ? formatMoneyFull(val, currency)
              : undefined;
          return (
            <span title={titleVal} className={cn(neg && 'text-rose-300')}>
              {formatCellValue(row.rowType, val, unitMode)}
            </span>
          );
        },
      }),
    );

    const yearCol = activeTable.hasYearColumn
      ? [
          columnHelper.accessor((d) => d.row.yearValue, {
            id: 'yearValue',
            header: () => (
              <button
                type="button"
                onClick={() => onSelectPeriod(-1)}
                className={cn(
                  'cursor-pointer rounded px-1.5 py-0.5 transition hover:text-white',
                  selectedPeriod < 0 && 'bg-sky-500/25 text-sky-200',
                )}
              >
                {statementKind === 'ratios' ? 'Rok / Koniec' : 'Rok'}
              </button>
            ),
            cell: (info) => {
              const { row, isCheckOk } = info.row.original;
              const val = info.getValue();
              if (row.rowType === 'CHECK') {
                return (
                  <span
                    className={cn(
                      'inline-flex rounded px-2 py-0.5 text-[10px] font-semibold',
                      isCheckOk
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-rose-500/20 text-rose-300',
                    )}
                  >
                    {isCheckOk ? '0,00 · OK' : formatNumber(val ?? 0, 2)}
                  </span>
                );
              }
              const neg = val !== null && isNegativeValue(row.rowType, val);
              const titleVal =
                val !== null && (row.rowType === 'DETAIL' || row.rowType === 'SUBTOTAL' || row.rowType === 'TOTAL')
                  ? formatMoneyFull(val, currency)
                  : undefined;
              return (
                <span
                  title={titleVal}
                  className={cn('font-semibold', neg ? 'text-rose-300' : 'text-white')}
                >
                  {formatCellValue(row.rowType, val, unitMode)}
                </span>
              );
            },
          }),
        ]
      : [];

    const deltaCol = columnHelper.accessor((d) => d.deltaVsBase, {
      id: 'deltaVsBase',
      header: () => (
        <span className="text-amber-200/90" title="Różnica aktywnej symulacji względem budżetu bazowego">
          Δ ({deltaScopeLabel})
        </span>
      ),
      cell: (info) => {
        const { row, deltaVsBase, deltaTone } = info.row.original;
        if (!isSimulationActive || deltaVsBase === null) {
          return <span className="text-[var(--ink-muted)]/50">–</span>;
        }
        const formatted = formatDeltaCellValue(row.rowType, deltaVsBase, unitMode);
        const hasChange = formatted !== '–' && formatted !== '0';
        const titleVal =
          row.rowType === 'DETAIL' || row.rowType === 'SUBTOTAL' || row.rowType === 'TOTAL'
            ? `${deltaVsBase >= 0 ? '+' : '−'}${formatMoneyFull(Math.abs(deltaVsBase), currency)}`
            : undefined;
        return (
          <span
            title={titleVal}
            className={cn('font-medium', deltaTextClass(deltaTone, hasChange))}
          >
            {formatted}
          </span>
        );
      },
    });

    return [labelCol, ...zeroCol, ...periodCols, ...yearCol, deltaCol];
  }, [
    activeTable.hasZeroColumn,
    activeTable.hasYearColumn,
    currency,
    deltaScopeLabel,
    isSimulationActive,
    multiYear,
    onSelectPeriod,
    periods,
    selectedPeriod,
    statementKind,
    unitMode,
    zeroDate,
  ]);

  const table = useReactTable({
    data: displayRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const visibleColCount = table.getVisibleLeafColumns().length;

  return (
    <section className="glass-card p-5" aria-label={title}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-display text-base font-semibold text-white">{title}</h2>
            {headerExtra}
          </div>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>
          ) : null}
        </div>

        {showAmountToggle ? (
          <div
            role="group"
            aria-label="Jednostka kwot w tabeli"
            className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-0.5 text-xs"
          >
            <button
              type="button"
              onClick={() => setUnitMode('thousands')}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 font-medium transition',
                unitMode === 'thousands'
                  ? 'bg-sky-500/30 text-white'
                  : 'text-[var(--ink-muted)] hover:text-white',
              )}
            >
              tys. {currency}
            </button>
            <button
              type="button"
              onClick={() => setUnitMode('full')}
              className={cn(
                'cursor-pointer rounded-full px-3 py-1 font-medium transition',
                unitMode === 'full'
                  ? 'bg-sky-500/30 text-white'
                  : 'text-[var(--ink-muted)] hover:text-white',
              )}
            >
              pełne {currency}
            </button>
          </div>
        ) : null}
      </div>

      <div className="max-h-[68vh] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[980px] border-collapse text-xs sm:text-[13px]">
          <thead className="sticky top-0 z-20 bg-[#0d1428]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/15">
                {hg.headers.map((header, idx) => {
                  const colId = header.column.id;
                  const isSticky = idx === 0;
                  const isZero = colId === 'zeroValue';
                  const isActiveCol =
                    (colId === 'yearValue' && selectedPeriod < 0) ||
                    colId === `m_${selectedPeriod}`;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]',
                        isSticky
                          ? 'sticky left-0 z-30 min-w-[240px] max-w-[310px] bg-[#0d1428] text-left shadow-[1px_0_0_rgba(255,255,255,0.1)]'
                          : 'text-right',
                        isZero && 'bg-[#0f1a36] border-r border-white/10',
                        isActiveCol && 'bg-sky-500/[0.10]',
                      )}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>

          <tbody>
            {table.getRowModel().rows.map((row) => {
              const item = row.original;
              const rType = item.row.rowType;

              if (rType === 'SECTION') {
                return (
                  <tr key={row.id} className="border-y border-white/15 bg-[#111c38]">
                    <td className="sticky left-0 z-10 bg-[#111c38] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300 shadow-[1px_0_0_rgba(255,255,255,0.1)]">
                      {item.row.label}
                    </td>
                    <td colSpan={Math.max(1, visibleColCount - 1)} className="bg-[#111c38]" />
                  </tr>
                );
              }

              const isTotal = rType === 'TOTAL';
              const isSubtotal = rType === 'SUBTOTAL';
              const isCheck = rType === 'CHECK';

              const stickyRowBg = isTotal
                ? 'bg-[#121c36]'
                : isSubtotal
                  ? 'bg-[#0f172e]'
                  : isCheck
                    ? 'bg-[#0d162c]'
                    : 'bg-[#0b1226]';

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-white/[0.06] transition hover:bg-white/[0.04]',
                    isTotal && 'border-t border-white/15 bg-white/[0.05] font-semibold',
                    isSubtotal && 'bg-white/[0.03] font-medium',
                    isCheck && 'border-t border-white/15 bg-white/[0.025]',
                  )}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const colId = cell.column.id;
                    const isSticky = idx === 0;
                    const isZero = colId === 'zeroValue';
                    const isActiveCol =
                      (colId === 'yearValue' && selectedPeriod < 0) ||
                      colId === `m_${selectedPeriod}`;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'whitespace-nowrap px-3 py-2',
                          isSticky
                            ? cn(
                                'sticky left-0 z-10 min-w-[240px] max-w-[310px] text-left shadow-[1px_0_0_rgba(255,255,255,0.1)]',
                                stickyRowBg,
                              )
                            : 'tabular-nums text-right text-[var(--ink)]',
                          isZero && 'border-r border-white/10 bg-[#0f1a36]/65',
                          colId === 'yearValue' && 'border-l border-white/[0.08] bg-white/[0.02]',
                          colId === 'deltaVsBase' && 'border-l border-white/[0.08] bg-amber-400/[0.025]',
                          isActiveCol && !isSticky && 'bg-sky-500/[0.08]',
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
