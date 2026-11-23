import { useMemo } from 'react';
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { HeatmapMatrixData, HeatmapRow } from '@/engine/costAnalytics';
import { cn } from '@/lib/utils';
import { formatMoneyCompact, formatMoneyFull, formatPercent } from '@/utils/formatters';

interface AllocationHeatmapTableProps {
  heatmap: HeatmapMatrixData;
  currency: string;
  periodLabel: string;
  selectedDeptCode: string | null;
  onToggleDept: (deptCode: string) => void;
}

const columnHelper = createColumnHelper<HeatmapRow>();

function heatCellBg(value: number, maxVal: number): string | undefined {
  if (value <= 0.5 || maxVal <= 0) return undefined;
  const ratio = Math.min(1, value / maxVal);
  const alpha = 0.08 + Math.pow(ratio, 0.72) * 0.42;
  return `rgba(57, 135, 229, ${alpha.toFixed(3)})`;
}

export function AllocationHeatmapTable({
  heatmap,
  currency,
  periodLabel,
  selectedDeptCode,
  onToggleDept,
}: AllocationHeatmapTableProps) {
  const columns = useMemo(() => {
    const deptCol = columnHelper.accessor('deptName', {
      id: 'deptName',
      header: () => <span>Dział</span>,
      cell: (info) => {
        const row = info.row.original;
        return (
          <div className="flex items-center gap-2 font-medium text-white">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: row.colorHex }}
            />
            <span className="truncate">{row.deptName}</span>
          </div>
        );
      },
    });

    const catCols = heatmap.categories.map((cat) =>
      columnHelper.accessor((row) => row.values[cat.code] ?? 0, {
        id: `cat_${cat.code}`,
        header: () => (
          <span title={cat.name}>{cat.shortName || cat.name}</span>
        ),
        cell: (info) => {
          const val = info.getValue();
          if (Math.abs(val) < 0.5) {
            return <span className="text-[var(--ink-muted)]/55">–</span>;
          }
          return (
            <span title={formatMoneyFull(val, currency)}>
              {formatMoneyCompact(val)}
            </span>
          );
        },
      }),
    );

    const totalCol = columnHelper.accessor('rowTotal', {
      id: 'rowTotal',
      header: () => <span>Razem</span>,
      cell: (info) => {
        const val = info.getValue();
        return (
          <span className="font-semibold text-white" title={formatMoneyFull(val, currency)}>
            {formatMoneyCompact(val)}
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

    return [deptCol, ...catCols, totalCol, shareCol];
  }, [heatmap.categories, currency]);

  const table = useReactTable({
    data: heatmap.rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <section className="glass-card p-5" aria-label="Macierz alokacji kosztów">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Macierz cieplna alokacji (Dział × Kategoria) · {periodLabel}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Intensywność koloru odzwierciedla koncentrację kosztów w danej komórce ({currency} netto). Kliknij wiersz, aby filtrować dział.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[760px] border-collapse text-xs sm:text-[13px]">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-white/10 bg-white/[0.04]">
                {hg.headers.map((header, idx) => {
                  const isSticky = idx === 0;
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'whitespace-nowrap px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]',
                        isSticky
                          ? 'sticky left-0 z-10 bg-[#0d1428] text-left shadow-[1px_0_0_rgba(255,255,255,0.08)]'
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
              const isSelected = selectedDeptCode === row.original.deptCode;
              const isDimmed = selectedDeptCode !== null && !isSelected;

              return (
                <tr
                  key={row.id}
                  onClick={() => onToggleDept(row.original.deptCode)}
                  className={cn(
                    'cursor-pointer border-b border-white/[0.06] transition hover:bg-white/[0.05]',
                    isSelected && 'bg-sky-500/12 ring-1 ring-inset ring-sky-400/50',
                    isDimmed && 'opacity-55 hover:opacity-90',
                  )}
                >
                  {row.getVisibleCells().map((cell, idx) => {
                    const colId = cell.column.id;
                    const isSticky = idx === 0;
                    const isHeatCell = colId.startsWith('cat_');
                    const rawVal = isHeatCell ? Number(cell.getValue() ?? 0) : 0;
                    const bg = isHeatCell ? heatCellBg(rawVal, heatmap.maxCellValue) : undefined;

                    return (
                      <td
                        key={cell.id}
                        style={bg ? { backgroundColor: bg } : undefined}
                        className={cn(
                          'whitespace-nowrap px-3 py-2.5',
                          isSticky
                            ? cn(
                                'sticky left-0 z-10 text-left shadow-[1px_0_0_rgba(255,255,255,0.08)]',
                                isSelected ? 'bg-[#10213e]' : 'bg-[#0b1226]',
                              )
                            : 'tabular-nums text-right text-[var(--ink)]',
                          colId === 'rowTotal' && 'bg-white/[0.025]',
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
            <tr className="border-t border-white/15 bg-white/[0.05] font-semibold">
              <td className="sticky left-0 z-10 bg-[#101933] px-3 py-2.5 text-left text-white shadow-[1px_0_0_rgba(255,255,255,0.08)]">
                Razem
              </td>
              {heatmap.categories.map((cat) => {
                const colSum = heatmap.colTotals[cat.code] ?? 0;
                return (
                  <td
                    key={cat.code}
                    title={formatMoneyFull(colSum, currency)}
                    className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-white"
                  >
                    {formatMoneyCompact(colSum)}
                  </td>
                );
              })}
              <td
                title={formatMoneyFull(heatmap.grandTotal, currency)}
                className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-sky-300"
              >
                {formatMoneyCompact(heatmap.grandTotal)}
              </td>
              <td className="tabular-nums whitespace-nowrap px-3 py-2.5 text-right text-white">
                100,0%
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}
