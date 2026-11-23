import { useState } from 'react';
import { ChevronDown, ChevronUp, SlidersHorizontal } from 'lucide-react';
import type { FinancialDomainModel } from '@/types/financial';
import { formatPercent } from '@/utils/formatters';

interface AllocationKeysAccordionProps {
  domain: FinancialDomainModel;
  onOpenSimulator: () => void;
}

export function AllocationKeysAccordion({
  domain,
  onOpenSimulator,
}: AllocationKeysAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  const hcDepts = domain.allocation.departments.filter((d) => d.hasHeadcount);
  const rentDepts = domain.allocation.departments.filter((d) => d.hasRentWeight);

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
            Założenia alokacji i klucze podziału (z arkusza 02_Alokacja_Dzialy)
          </h2>
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
            {expanded
              ? `Obsada (${Math.round(domain.config.headcountTotal)} os.), klucze najmu oraz ${domain.allocation.matrix.length} reguł mapowania linii kosztowych.`
              : 'Kliknij, aby podejrzeć aktualne klucze obsady, najmu oraz reguły przypisania kosztów do działów.'}
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-xs font-medium text-[var(--ink-secondary)]">
          {expanded ? (
            <>
              Zwiń <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Pokaż klucze <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </span>
      </button>

      {expanded ? (
        <div className="space-y-4 border-t border-white/10 p-5 pt-4">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Obsada */}
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                  Klucz obsady (Płace, ZUS, Pozostałe stałe)
                </h3>
                <span className="tabular-nums text-xs font-semibold text-sky-300">
                  Razem {Math.round(domain.config.headcountTotal)} os.
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {hcDepts.map((d) => (
                  <div
                    key={d.code}
                    className="flex items-center justify-between gap-2 border-b border-white/[0.06] py-1 last:border-b-0"
                  >
                    <span className="flex items-center gap-2 text-white">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: d.colorHex }}
                      />
                      {d.name}
                    </span>
                    <span className="tabular-nums text-[var(--ink-secondary)]">
                      <strong className="text-white">{Math.round(d.headcount)} os.</strong> ·{' '}
                      {formatPercent(d.headcountShare, 1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Najem */}
            <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="mb-2.5 flex items-center justify-between">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                  Klucz powierzchni / najmu
                </h3>
                <span className="text-xs text-[var(--ink-muted)]">
                  {rentDepts.length} działy z powierzchnią
                </span>
              </div>
              <div className="space-y-1.5 text-xs">
                {rentDepts.map((d) => (
                  <div
                    key={d.code}
                    className="flex items-center justify-between gap-2 border-b border-white/[0.06] py-1 last:border-b-0"
                  >
                    <span className="flex items-center gap-2 text-white">
                      <span
                        className="h-2 w-2 rounded-sm"
                        style={{ backgroundColor: d.colorHex }}
                      />
                      {d.name}
                    </span>
                    <span className="tabular-nums text-[var(--ink-secondary)]">
                      waga <strong className="text-white">{Math.round(d.rentWeight)}</strong> ·{' '}
                      {formatPercent(d.rentShare, 1)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Reguły linii */}
          <div className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
            <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--ink-secondary)]">
                Mapowanie pozycji kosztowych (TBL_ALLOC_MATRIX)
              </h3>
              <button
                type="button"
                onClick={onOpenSimulator}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200 transition hover:bg-sky-500/25"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Edytuj etaty i najem w Symulatorze
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {domain.allocation.matrix.map((m) => (
                <div
                  key={m.lineCode}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium text-white">{m.lineName}</span>
                    <span className="shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-secondary)]">
                      {m.costBehavior === 'VARIABLE' ? 'Zmienny' : 'Stały'}
                    </span>
                  </div>
                  <div className="mt-1 truncate text-[11px] text-[var(--ink-muted)]">
                    {m.allocRule || 'Przypisanie z arkusza'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
