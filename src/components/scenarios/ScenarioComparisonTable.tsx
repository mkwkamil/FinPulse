import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import {
  buildScenarioComparisonRows,
  SCENARIO_PALETTE,
  type ScenarioComparisonRow,
  type ScenarioMetricFormat,
} from '@/engine/scenarioComparison';
import { cn } from '@/lib/utils';
import type { ResolvedSliderControl } from '@/types/contract';
import type { FinancialDomainModel } from '@/types/financial';
import type { ScenarioSnapshot } from '@/types/scenario';
import {
  formatMoneyFull,
  formatNumber,
  formatPercent,
  formatPpDelta,
  formatRatio,
  formatSliderValue,
  formatThousands,
} from '@/utils/formatters';

interface ScenarioComparisonTableProps {
  scenarios: ScenarioSnapshot[];
  baseDomain: FinancialDomainModel;
}

type UnitMode = 'thousands' | 'full';

const columnHelper = createColumnHelper<ScenarioComparisonRow>();

function formatMetricValue(
  format: ScenarioMetricFormat,
  value: number | null,
  unitMode: UnitMode,
  sliderControl?: ResolvedSliderControl,
): string {
  if (value === null || !Number.isFinite(value)) return '–';
  if (format === 'slider' && sliderControl) {
    return formatSliderValue(sliderControl, value);
  }
  if (format === 'percent') return formatPercent(value, 1);
  if (format === 'ratio') return formatRatio(value, 2, 'x');
  if (format === 'days') return `${formatNumber(value, 1)} dni`;
  if (format === 'check') {
    return Math.abs(value) <= 0.01 ? '0,00 · OK' : formatNumber(value, 2);
  }
  if (unitMode === 'thousands') return formatThousands(value);
  return formatNumber(Math.round(value), 0);
}

function formatMetricDelta(
  format: ScenarioMetricFormat,
  delta: number | null,
  unitMode: UnitMode,
  sliderControl?: ResolvedSliderControl,
): string | null {
  if (delta === null || !Number.isFinite(delta)) return null;
  if (format === 'check') return null;

  if (format === 'slider' && sliderControl) {
    if (Math.abs(delta) < 1e-6) return null;
    if (sliderControl.format === 'percent' || sliderControl.format === 'percent_signed') {
      return formatPpDelta(delta, 1);
    }
    return `${delta > 0 ? '+' : ''}${formatNumber(delta, Math.abs(sliderControl.step) < 1 ? 2 : 0)}`;
  }

  if (format === 'percent') {
    if (Math.abs(delta) < 0.0005) return null;
    return formatPpDelta(delta, 1);
  }
  if (format === 'ratio') {
    if (Math.abs(delta) < 0.005) return null;
    return `${delta > 0 ? '+' : ''}${formatNumber(delta, 2)}x`;
  }
  if (format === 'days') {
    if (Math.abs(delta) < 0.05) return null;
    return `${delta > 0 ? '+' : ''}${formatNumber(delta, 1)} d`;
  }

  if (Math.abs(delta) < 1) return null;
  if (unitMode === 'thousands') {
    const k = Math.round(delta / 1000);
    if (k === 0) return null;
    return `${k > 0 ? '+' : ''}${formatNumber(k, 0)}`;
  }
  return `${delta > 0 ? '+' : ''}${formatNumber(Math.round(delta), 0)}`;
}

function isValueNegative(format: ScenarioMetricFormat, value: number | null): boolean {
  if (value === null || !Number.isFinite(value)) return false;
  if (format === 'percent') return value < -0.0005;
  if (format === 'currency') return value < -0.5;
  return false;
}

export function ScenarioComparisonTable({
  scenarios,
  baseDomain,
}: ScenarioComparisonTableProps) {
  const [unitMode, setUnitMode] = useState<UnitMode>('thousands');
  const currency = baseDomain.metadata.currency || 'PLN';

  const comparisonRows = useMemo(
    () => buildScenarioComparisonRows(scenarios, baseDomain),
    [scenarios, baseDomain],
  );

  const columns = useMemo(() => {
    const labelCol = columnHelper.accessor('label', {
      id: 'label',
      header: () => (
        <span>
          Metryka / Założenie{' '}
          <span className="font-normal text-[var(--ink-muted)]">
            ({unitMode === 'thousands' ? `tys. ${currency}` : currency})
          </span>
        </span>
      ),
      cell: (info) => (
        <span className="font-medium text-white">{info.getValue()}</span>
      ),
    });

    const scenCols = scenarios.map((sc, idx) => {
      const color = SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length];
      const isLiveVirtual = sc.id === '__live_sim__';

      return columnHelper.accessor((row) => row.valuesByScenarioId[sc.id] ?? null, {
        id: `sc_${sc.id}`,
        header: () => (
          <div className="inline-flex flex-col items-end gap-0.5">
            <span className="inline-flex items-center gap-1.5 text-white">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="max-w-[160px] truncate">{sc.name}</span>
            </span>
            {sc.isBase ? (
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                Baza
              </span>
            ) : isLiveVirtual ? (
              <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-200">
                Na żywo
              </span>
            ) : (
              <span className="text-[10px] font-normal text-[var(--ink-muted)]">
                Δ vs Baza poniżej
              </span>
            )}
          </div>
        ),
        cell: (info) => {
          const item = info.row.original;
          const val = info.getValue();
          const delta = item.deltasVsBaseByScenarioId[sc.id] ?? null;
          const deltaTxt = formatMetricDelta(
            item.format,
            delta,
            unitMode,
            item.sliderControl,
          );

          const isCheck = item.format === 'check';
          if (isCheck) {
            const ok = val !== null && Math.abs(val) <= 0.01;
            return (
              <span
                className={cn(
                  'inline-flex rounded px-2 py-0.5 text-[11px] font-semibold',
                  ok
                    ? 'bg-emerald-500/15 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300',
                )}
              >
                {formatMetricValue(item.format, val, unitMode)}
              </span>
            );
          }

          let deltaClass = 'text-sky-200';
          if (delta !== null && item.higherIsBetter !== null) {
            const good = item.higherIsBetter ? delta > 0 : delta < 0;
            deltaClass = good ? 'text-emerald-300' : 'text-rose-300';
          } else if (item.format === 'slider') {
            deltaClass = 'text-amber-200';
          }

          return (
            <div className="flex flex-col items-end">
              <span
                title={
                  item.format === 'currency' && val !== null
                    ? formatMoneyFull(val, currency)
                    : undefined
                }
                className={cn(
                  'font-semibold',
                  isValueNegative(item.format, val) ? 'text-rose-300' : 'text-white',
                )}
              >
                {formatMetricValue(item.format, val, unitMode, item.sliderControl)}
              </span>
              {deltaTxt ? (
                <span className={cn('text-[11px] font-medium', deltaClass)}>
                  {deltaTxt}
                </span>
              ) : null}
            </div>
          );
        },
      });
    });

    return [labelCol, ...scenCols];
  }, [scenarios, unitMode, currency]);

  const table = useReactTable({
    data: comparisonRows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const visibleColCount = table.getVisibleLeafColumns().length;

  return (
    <section className="glass-card p-5" aria-label="Tabela porównawcza scenariuszy">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Tabela zarządcza Side-by-Side (Założenia · RZiS · Działy · Płynność)
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Kompletne zestawienie wariantów przeliczonych przez silnik HyperFormula wraz z różnicą względem budżetu bazowego.
          </p>
        </div>

        <div
          role="group"
          aria-label="Jednostka kwot"
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
      </div>

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[780px] border-collapse text-xs sm:text-[13px]">
          <thead className="sticky top-0 z-20 bg-[#0d1428]">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/15">
                {hg.headers.map((header, idx) => {
                  const isSticky = idx === 0;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'whitespace-nowrap px-3.5 py-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]',
                        isSticky
                          ? 'sticky left-0 z-30 min-w-[260px] max-w-[320px] bg-[#0d1428] text-left shadow-[1px_0_0_rgba(255,255,255,0.1)]'
                          : 'text-right',
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
              if (item.rowKind === 'section') {
                return (
                  <tr key={row.id} className="border-y border-white/15 bg-[#111c38]">
                    <td className="sticky left-0 z-10 bg-[#111c38] px-3.5 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-sky-300 shadow-[1px_0_0_rgba(255,255,255,0.1)]">
                      {item.label}
                    </td>
                    <td colSpan={Math.max(1, visibleColCount - 1)} className="bg-[#111c38]" />
                  </tr>
                );
              }

              const isHighlight =
                item.id === 'pl_PL_EBITDA' ||
                item.id === 'pl_PL_NET_INCOME' ||
                item.id === 'dept_total_cost';

              return (
                <tr
                  key={row.id}
                  className={cn(
                    'border-b border-white/[0.06] transition hover:bg-white/[0.04]',
                    isHighlight && 'bg-white/[0.035]',
                  )}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const isSticky = idx === 0;
                    return (
                      <td
                        key={cell.id}
                        className={cn(
                          'whitespace-nowrap px-3.5 py-2.5',
                          isSticky
                            ? cn(
                                'sticky left-0 z-10 min-w-[260px] max-w-[320px] text-left shadow-[1px_0_0_rgba(255,255,255,0.1)]',
                                isHighlight ? 'bg-[#101933]' : 'bg-[#0b1226]',
                              )
                            : 'tabular-nums text-right',
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
