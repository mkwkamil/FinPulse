import { useMemo, useState } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FinancialDomainModel } from '@/types/financial';
import { cn } from '@/lib/utils';
import {
  formatMoneyFull,
  formatPercent,
  formatPeriodShort,
  formatThousands,
} from '@/utils/formatters';

interface MonthlyDeptRow {
  deptCode: string;
  deptName: string;
  colorHex: string;
  months: number[];
  yearTotal: number;
  share: number;
}

interface MonthlyDeptTableProps {
  domain: FinancialDomainModel;
  selectedPeriod: number;
  selectedDeptCode: string | null;
  onSelectPeriod: (periodIdx: number) => void;
  onToggleDept: (deptCode: string) => void;
}

const columnHelper = createColumnHelper<MonthlyDeptRow>();

export function MonthlyDeptTable({
  domain,
  selectedPeriod,
  selectedDeptCode,
  onSelectPeriod,
  onToggleDept,
}: MonthlyDeptTableProps) {
  const [expanded, setExpanded] = useState(false);

  const currency = domain.metadata.currency || 'PLN';
  const periods = domain.metadata.periodHeaders;
  const multiYear = periods.length > 12;

  const rowsData = useMemo<MonthlyDeptRow[]>(() => {
    const metaMap = new Map(domain.allocation.departments.map((d) => [d.code, d]));
    return domain.allocation.deptCosts.map((dc) => ({
      deptCode: dc.deptCode,
      deptName: dc.deptName,
      colorHex: metaMap.get(dc.deptCode)?.colorHex ?? '#3987e5',
      months: dc.months,
      yearTotal: dc.yearTotal,
      share: dc.share,
    }));
  }, [domain]);

  const summary = useMemo(() => {
    const costMonthly = periods.map((_, i) =>
      domain.allocation.deptCosts.reduce((acc, d) => acc + (d.months[i] ?? 0), 0),
    );
    const costYear = domain.allocation.deptCosts.reduce((acc, d) => acc + d.yearTotal, 0);

    const revRow = domain.pl.byCode.PL_REV_TOTAL;
    const revMonthly = periods.map((_, i) => revRow?.months[i] ?? 0);
    const revYear = revRow?.yearValue ?? 0;

    const netRow = domain.pl.byCode.PL_NET_INCOME;
    const netMonthly = periods.map((_, i) => netRow?.months[i] ?? 0);
    const netYear = netRow?.yearValue ?? 0;

    return { costMonthly, costYear, revMonthly, revYear, netMonthly, netYear };
  }, [domain, periods]);

  const columns = useMemo(() => {
    const deptCol = columnHelper.accessor('deptName', {
      id: 'deptName',
      header: () => <span>Dział (tys. {currency})</span>,
      cell: (info) => {
        const r = info.row.original;
        return (
          <div className="flex items-center gap-2 font-medium text-white">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: r.colorHex }}
            />
            <span className="truncate">{r.deptName}</span>
          </div>
        );
      },
    });

    const periodCols = periods.map((hdr, mIdx) =>
      columnHelper.accessor((row) => row.months[mIdx] ?? 0, {
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
          const v = info.getValue();
          return <span title={formatMoneyFull(v, currency)}>{formatThousands(v)}</span>;
        },
      }),
    );

    const yearCol = columnHelper.accessor('yearTotal', {
      id: 'yearTotal',
      header: () => (
        <button
          type="button"
          onClick={() => onSelectPeriod(-1)}
          className={cn(
            'cursor-pointer rounded px-1.5 py-0.5 transition hover:text-white',
            selectedPeriod < 0 && 'bg-sky-500/25 text-sky-200',
          )}
        >
          Okres
        </button>
      ),
      cell: (info) => {
        const v = info.getValue();
        return (
          <span className="font-semibold text-white" title={formatMoneyFull(v, currency)}>
            {formatThousands(v)}
          </span>
        );
      },
    });

    const shareCol = columnHelper.accessor('share', {
      id: 'share',
      header: () => <span>Udział</span>,
      cell: (info) => (
        <span className="text-[var(--ink-secondary)]">
          {formatPercent(info.getValue(), 1)}
        </span>
      ),
    });

    return [deptCol, ...periodCols, yearCol, shareCol];
  }, [periods, multiYear, currency, selectedPeriod, onSelectPeriod]);

  const table = useReactTable({
    data: rowsData,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="glass-card overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left transition hover:bg-white/[0.025]"
      >
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Koszty działów miesiąc po miesiącu (tys. {currency})
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {expanded
              ? 'Kliknij nagłówek miesiąca, aby ustawić aktywny okres; kliknij wiersz działu, aby filtrować.'
              : `Rozwiń pełną tabelę ${periods.length}-miesięczną z wierszami sumy kosztów, przychodów i wyniku netto.`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--ink-secondary)]">
          {expanded ? (
            <>
              Zwiń <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Rozwiń tabelę <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-white/10 p-5 pt-4">
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[920px] border-collapse text-xs">
              <thead>
                {table.getHeaderGroups().map((hg) => (
                  <tr key={hg.id} className="border-b border-white/10 bg-white/[0.04]">
                    {hg.headers.map((header, idx) => {
                      const isSticky = idx === 0;
                      const colId = header.column.id;
                      const isActiveCol =
                        (colId === 'yearTotal' && selectedPeriod < 0) ||
                        colId === `m_${selectedPeriod}`;
                      return (
                        <th
                          key={header.id}
                          className={cn(
                            'whitespace-nowrap px-2.5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]',
                            isSticky
                              ? 'sticky left-0 z-10 bg-[#0d1428] text-left shadow-[1px_0_0_rgba(255,255,255,0.08)]'
                              : 'text-right',
                            isActiveCol && 'bg-sky-500/[0.08]',
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
                  const isSelected = selectedDeptCode === row.original.deptCode;
                  return (
                    <tr
                      key={row.id}
                      onClick={() => onToggleDept(row.original.deptCode)}
                      className={cn(
                        'cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.05]',
                        isSelected && 'bg-sky-500/12',
                      )}
                    >
                      {row.getVisibleCells().map((cell, idx) => {
                        const isSticky = idx === 0;
                        const colId = cell.column.id;
                        const isActiveCol =
                          (colId === 'yearTotal' && selectedPeriod < 0) ||
                          colId === `m_${selectedPeriod}`;
                        return (
                          <td
                            key={cell.id}
                            className={cn(
                              'whitespace-nowrap px-2.5 py-2',
                              isSticky
                                ? cn(
                                    'sticky left-0 z-10 text-left shadow-[1px_0_0_rgba(255,255,255,0.08)]',
                                    isSelected ? 'bg-[#10213e]' : 'bg-[#0b1226]',
                                  )
                                : 'tabular-nums text-right text-[var(--ink)]',
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

              <tfoot>
                <tr className="border-t border-white/15 bg-white/[0.05] font-semibold text-white">
                  <td className="sticky left-0 z-10 bg-[#101933] px-2.5 py-2 text-left shadow-[1px_0_0_rgba(255,255,255,0.08)]">
                    Koszty razem (przed CIT)
                  </td>
                  {summary.costMonthly.map((v, idx) => (
                    <td
                      key={`cost-${idx}`}
                      title={formatMoneyFull(v, currency)}
                      className={cn(
                        'tabular-nums whitespace-nowrap px-2.5 py-2 text-right',
                        selectedPeriod === idx && 'bg-sky-500/[0.10]',
                      )}
                    >
                      {formatThousands(v)}
                    </td>
                  ))}
                  <td
                    title={formatMoneyFull(summary.costYear, currency)}
                    className={cn(
                      'tabular-nums whitespace-nowrap px-2.5 py-2 text-right text-sky-300',
                      selectedPeriod < 0 && 'bg-sky-500/[0.10]',
                    )}
                  >
                    {formatThousands(summary.costYear)}
                  </td>
                  <td className="tabular-nums whitespace-nowrap px-2.5 py-2 text-right">
                    100,0%
                  </td>
                </tr>

                <tr className="border-t border-white/[0.08] bg-white/[0.025] text-[var(--ink-secondary)]">
                  <td className="sticky left-0 z-10 bg-[#0d1428] px-2.5 py-2 text-left font-medium shadow-[1px_0_0_rgba(255,255,255,0.08)]">
                    Przychody ze sprzedaży
                  </td>
                  {summary.revMonthly.map((v, idx) => (
                    <td
                      key={`rev-${idx}`}
                      title={formatMoneyFull(v, currency)}
                      className={cn(
                        'tabular-nums whitespace-nowrap px-2.5 py-2 text-right',
                        selectedPeriod === idx && 'bg-sky-500/[0.08]',
                      )}
                    >
                      {formatThousands(v)}
                    </td>
                  ))}
                  <td
                    title={formatMoneyFull(summary.revYear, currency)}
                    className={cn(
                      'tabular-nums whitespace-nowrap px-2.5 py-2 text-right font-semibold text-white',
                      selectedPeriod < 0 && 'bg-sky-500/[0.08]',
                    )}
                  >
                    {formatThousands(summary.revYear)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[var(--ink-muted)]">–</td>
                </tr>

                <tr className="border-t border-white/[0.08] bg-white/[0.03] font-semibold">
                  <td className="sticky left-0 z-10 bg-[#0e162c] px-2.5 py-2 text-left text-white shadow-[1px_0_0_rgba(255,255,255,0.08)]">
                    Wynik netto
                  </td>
                  {summary.netMonthly.map((v, idx) => (
                    <td
                      key={`net-${idx}`}
                      title={formatMoneyFull(v, currency)}
                      className={cn(
                        'tabular-nums whitespace-nowrap px-2.5 py-2 text-right',
                        v >= 0 ? 'text-emerald-300' : 'text-rose-300',
                        selectedPeriod === idx && 'bg-sky-500/[0.08]',
                      )}
                    >
                      {formatThousands(v)}
                    </td>
                  ))}
                  <td
                    title={formatMoneyFull(summary.netYear, currency)}
                    className={cn(
                      'tabular-nums whitespace-nowrap px-2.5 py-2 text-right',
                      summary.netYear >= 0 ? 'text-emerald-300' : 'text-rose-300',
                      selectedPeriod < 0 && 'bg-sky-500/[0.08]',
                    )}
                  >
                    {formatThousands(summary.netYear)}
                  </td>
                  <td className="px-2.5 py-2 text-right text-[var(--ink-muted)]">–</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}
