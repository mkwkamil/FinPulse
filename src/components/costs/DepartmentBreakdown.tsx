import { FilterX } from 'lucide-react';
import type { DeptBreakdownItem } from '@/engine/costAnalytics';
import { cn } from '@/lib/utils';
import { formatMoneyCompact, formatMoneyFull, formatPercent } from '@/utils/formatters';

interface DepartmentBreakdownProps {
  departments: DeptBreakdownItem[];
  currency: string;
  periodLabel: string;
  selectedDeptCode: string | null;
  isSimulationActive: boolean;
  onToggleDept: (deptCode: string) => void;
  onClearFilter: () => void;
}

export function DepartmentBreakdown({
  departments,
  currency,
  periodLabel,
  selectedDeptCode,
  isSimulationActive,
  onToggleDept,
  onClearFilter,
}: DepartmentBreakdownProps) {
  const maxVal = Math.max(1, ...departments.map((d) => d.amount));

  return (
    <div className="glass-card flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Rozkład kosztów wg działów · {periodLabel}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            Kliknij dział, aby przefiltrować kategorie, podświetlić trend i wiersz macierzy.
          </p>
        </div>

        {selectedDeptCode ? (
          <button
            type="button"
            onClick={onClearFilter}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-400/50 bg-sky-500/15 px-2.5 py-1 text-xs font-medium text-sky-200 transition hover:bg-sky-500/25"
          >
            <FilterX className="h-3.5 w-3.5" />
            Wyczyść filtr
          </button>
        ) : null}
      </div>

      <div className="space-y-2">
        {departments.map((dept) => {
          const isSelected = selectedDeptCode === dept.code;
          const isDimmed = selectedDeptCode !== null && !isSelected;
          const barPct = Math.min(100, Math.max(0, (dept.amount / maxVal) * 100));
          const hasDelta = isSimulationActive && Math.abs(dept.deltaVsBase) >= 1;

          return (
            <button
              key={dept.code}
              type="button"
              onClick={() => onToggleDept(dept.code)}
              aria-pressed={isSelected}
              title={formatMoneyFull(dept.amount, currency)}
              className={cn(
                'w-full cursor-pointer rounded-xl border px-3 py-2.5 text-left transition',
                isSelected
                  ? 'border-sky-400/75 bg-sky-500/12 shadow-[0_0_20px_rgba(74,163,255,0.18)]'
                  : 'border-white/[0.06] bg-white/[0.025] hover:border-white/20 hover:bg-white/[0.05]',
                isDimmed && 'opacity-50 hover:opacity-85',
              )}
            >
              <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium text-white">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: dept.colorHex }}
                  />
                  <span className="truncate">{dept.name}</span>
                  <span className="hidden rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-semibold tracking-wider text-[var(--ink-muted)] sm:inline">
                    {dept.code}
                  </span>
                </span>

                <span className="flex shrink-0 items-center gap-2">
                  {hasDelta ? (
                    <span
                      className={cn(
                        'tabular-nums rounded px-1.5 py-0.5 text-[11px] font-medium',
                        dept.deltaVsBase <= 0
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : 'bg-rose-500/15 text-rose-300',
                      )}
                    >
                      {dept.deltaVsBase >= 0 ? '+' : '−'}
                      {formatMoneyCompact(Math.abs(dept.deltaVsBase))}
                    </span>
                  ) : null}
                  <span className="tabular-nums font-semibold text-white">
                    {formatMoneyCompact(dept.amount, currency)}
                  </span>
                  <span className="tabular-nums w-12 text-right text-xs text-[var(--ink-muted)]">
                    {formatPercent(dept.share, 1)}
                  </span>
                </span>
              </div>

              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${barPct}%`,
                    backgroundColor: dept.colorHex,
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
