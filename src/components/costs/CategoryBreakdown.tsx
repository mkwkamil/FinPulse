import { X } from 'lucide-react';
import type { CategoryBreakdownItem } from '@/engine/costAnalytics';
import { cn } from '@/lib/utils';
import { formatMoneyCompact, formatMoneyFull, formatPercent } from '@/utils/formatters';

interface CategoryBreakdownProps {
  categories: CategoryBreakdownItem[];
  currency: string;
  periodLabel: string;
  activeDept: { code: string; name: string; colorHex: string } | null;
  isSimulationActive: boolean;
  onClearDept: () => void;
}

export function CategoryBreakdown({
  categories,
  currency,
  periodLabel,
  activeDept,
  isSimulationActive,
  onClearDept,
}: CategoryBreakdownProps) {
  const maxVal = Math.max(1, ...categories.map((c) => c.amount));

  return (
    <div className="glass-card flex flex-col p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Kategorie kosztów · {periodLabel}
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {activeDept
              ? `Struktura rodzajowa po alokacji dla działu ${activeDept.name}.`
              : 'Łączne koszty spółki (przed CIT) w podziale na kategorie.'}
          </p>
        </div>

        {activeDept ? (
          <button
            type="button"
            onClick={onClearDept}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.07] px-2.5 py-1 text-xs font-medium text-white transition hover:border-sky-400/60"
          >
            <span
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: activeDept.colorHex }}
            />
            {activeDept.name}
            <X className="h-3 w-3 text-[var(--ink-muted)]" />
          </button>
        ) : null}
      </div>

      {categories.length === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/10 py-10 text-xs text-[var(--ink-muted)]">
          Brak istotnych kosztów dla wybranego filtra.
        </div>
      ) : (
        <div className="space-y-2.5">
          {categories.map((cat) => {
            const barPct = Math.min(100, Math.max(0, (cat.amount / maxVal) * 100));
            const hasDelta = isSimulationActive && Math.abs(cat.deltaVsBase) >= 1;
            const barColor = activeDept?.colorHex ?? '#4aa3ff';

            return (
              <div
                key={cat.code}
                title={formatMoneyFull(cat.amount, currency)}
                className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3 text-xs sm:text-sm">
                  <span className="truncate font-medium text-white">{cat.name}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    {hasDelta ? (
                      <span
                        className={cn(
                          'tabular-nums rounded px-1.5 py-0.5 text-[11px] font-medium',
                          cat.deltaVsBase <= 0
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-rose-500/15 text-rose-300',
                        )}
                      >
                        {cat.deltaVsBase >= 0 ? '+' : '−'}
                        {formatMoneyCompact(Math.abs(cat.deltaVsBase))}
                      </span>
                    ) : null}
                    <span className="tabular-nums font-semibold text-white">
                      {formatMoneyCompact(cat.amount, currency)}
                    </span>
                    <span className="tabular-nums w-12 text-right text-xs text-[var(--ink-muted)]">
                      {formatPercent(cat.share, 1)}
                    </span>
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{
                      width: `${barPct}%`,
                      backgroundColor: barColor,
                      opacity: activeDept ? 0.95 : 0.85,
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
