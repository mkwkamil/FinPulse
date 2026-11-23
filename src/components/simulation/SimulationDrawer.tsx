import { useEffect, useMemo } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { ResolvedSliderControl } from '@/types/contract';
import type { FinancialDomainModel } from '@/types/financial';
import { formatMoneyCompact, formatPeriodShort } from '@/utils/formatters';
import { cn } from '@/lib/utils';
import { DynamicSliderControl } from './DynamicSliderControl';
import { PresetChips } from './PresetChips';

function getPeriodCostTotal(domain: FinancialDomainModel, periodIdx: number): number {
  if (periodIdx < 0) {
    return domain.allocation.deptCosts.reduce((acc, d) => acc + d.yearTotal, 0);
  }
  return domain.allocation.deptCosts.reduce(
    (acc, d) => acc + (d.months[periodIdx] ?? 0),
    0,
  );
}

function getPeriodNetIncome(domain: FinancialDomainModel, periodIdx: number): number {
  const row = domain.pl.byCode.PL_NET_INCOME;
  if (!row) return 0;
  if (periodIdx < 0) return row.yearValue ?? row.months.reduce((a, b) => a + b, 0);
  return row.months[periodIdx] ?? 0;
}

function DeltaLabel({
  current,
  base,
  costMode,
  currency,
}: {
  current: number;
  base: number;
  costMode: boolean;
  currency: string;
}) {
  const diff = current - base;
  if (Math.abs(diff) < 1) {
    return <span className="text-[11px] text-[var(--ink-muted)]">bez zmian</span>;
  }
  const good = costMode ? diff < 0 : diff > 0;
  return (
    <span
      className={cn(
        'tabular-nums text-[11px] font-semibold',
        good ? 'text-emerald-300' : 'text-rose-300',
      )}
    >
      {diff > 0 ? '▲ +' : '▼ −'}
      {formatMoneyCompact(Math.abs(diff), currency)}
    </span>
  );
}

export function SimulationDrawer() {
  const baseDomain = useFinPulseStore((s) => s.baseDomain);
  const activeDomain = useFinPulseStore((s) => s.activeDomain);
  const sliderValues = useFinPulseStore((s) => s.sliderValues);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);
  const drawerOpen = useFinPulseStore((s) => s.drawerOpen);
  const selectedPeriod = useFinPulseStore((s) => s.selectedPeriod);
  const setDrawerOpen = useFinPulseStore((s) => s.setDrawerOpen);
  const setSliderValue = useFinPulseStore((s) => s.setSliderValue);
  const resetSlider = useFinPulseStore((s) => s.resetSlider);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen, setDrawerOpen]);

  const groupedControls = useMemo(() => {
    if (!activeDomain) return [];
    const groups = new Map<string, ResolvedSliderControl[]>();
    for (const ctrl of activeDomain.sliderControls) {
      const list = groups.get(ctrl.group) ?? [];
      list.push(ctrl);
      groups.set(ctrl.group, list);
    }
    return [...groups.entries()].map(([groupName, items]) => {
      const isHeadcountGroup = items.every((i) => i.format === 'integer_os');
      const isWeightGroup = items.every((i) => i.format === 'weight_share');
      const groupSum = items.reduce(
        (acc, i) => acc + (sliderValues[i.controlKey] ?? i.baseValue),
        0,
      );
      return { groupName, items, isHeadcountGroup, isWeightGroup, groupSum };
    });
  }, [activeDomain, sliderValues]);

  if (!activeDomain || !baseDomain) return null;

  const currency = activeDomain.metadata.currency;
  const multiYear = activeDomain.metadata.periodHeaders.length > 12;
  const periodLabel =
    selectedPeriod < 0
      ? 'rok'
      : formatPeriodShort(
          activeDomain.metadata.periodHeaders[selectedPeriod] ?? '',
          multiYear,
        );

  const yearCost = getPeriodCostTotal(activeDomain, -1);
  const baseYearCost = getPeriodCostTotal(baseDomain, -1);
  const yearNet = getPeriodNetIncome(activeDomain, -1);
  const baseYearNet = getPeriodNetIncome(baseDomain, -1);

  const periodCost = getPeriodCostTotal(activeDomain, selectedPeriod);
  const basePeriodCost = getPeriodCostTotal(baseDomain, selectedPeriod);
  const periodNet = getPeriodNetIncome(activeDomain, selectedPeriod);
  const basePeriodNet = getPeriodNetIncome(baseDomain, selectedPeriod);

  return (
    <>
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-expanded={drawerOpen}
        aria-controls="simulation-drawer"
        className="fixed right-5 bottom-5 z-40 inline-flex cursor-pointer items-center gap-2.5 rounded-full border border-sky-400/80 bg-gradient-to-br from-sky-500/85 to-violet-500/80 px-5 py-3 text-sm font-semibold text-white shadow-[0_0_26px_rgba(74,163,255,0.55),0_8px_24px_rgba(0,0,0,0.45)] transition hover:brightness-110"
      >
        {isSimulationActive ? (
          <span className="h-2 w-2 rounded-full bg-[#ffd36b] shadow-[0_0_10px_#ffd36b]" />
        ) : null}
        <SlidersHorizontal className="h-4 w-4" />
        Symulacja
      </button>

      {drawerOpen ? (
        <div
          className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]"
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      ) : null}

      <aside
        id="simulation-drawer"
        aria-label="Panel symulacji What-If"
        aria-hidden={!drawerOpen}
        className={cn(
          'fixed top-0 right-0 bottom-0 z-50 flex w-[min(420px,100vw)] flex-col border-l border-sky-400/40 bg-[#080c1c]/97 shadow-[-10px_0_50px_rgba(0,0,0,0.65)] backdrop-blur-xl transition-transform duration-300',
          drawerOpen ? 'translate-x-0' : 'pointer-events-none translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
          <div>
            <h2 className="font-display text-base font-bold text-white">
              Symulacja założeń What-If
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              Suwaki wygenerowane z arkusza 00_Konfiguracja_UI · przelicza HyperFormula
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            aria-label="Zamknij panel symulacji"
            className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/15"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* Live KPI 2x2 */}
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Koszty roczne
              </div>
              <div className="font-display tabular-nums mt-0.5 text-base font-bold text-white">
                {formatMoneyCompact(yearCost)}
              </div>
              <DeltaLabel current={yearCost} base={baseYearCost} costMode currency={currency} />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Wynik netto roczny
              </div>
              <div className="font-display tabular-nums mt-0.5 text-base font-bold text-white">
                {formatMoneyCompact(yearNet)}
              </div>
              <DeltaLabel current={yearNet} base={baseYearNet} costMode={false} currency={currency} />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Koszty: {periodLabel}
              </div>
              <div className="font-display tabular-nums mt-0.5 text-base font-bold text-white">
                {formatMoneyCompact(periodCost)}
              </div>
              <DeltaLabel current={periodCost} base={basePeriodCost} costMode currency={currency} />
            </div>

            <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                Wynik: {periodLabel}
              </div>
              <div className="font-display tabular-nums mt-0.5 text-base font-bold text-white">
                {formatMoneyCompact(periodNet)}
              </div>
              <DeltaLabel current={periodNet} base={basePeriodNet} costMode={false} currency={currency} />
            </div>
          </div>

          <PresetChips />

          {/* Dynamiczne grupy suwaków */}
          <div className="space-y-4">
            {groupedControls.map((grp) => (
              <div key={grp.groupName} className="space-y-1 border-t border-white/10 pt-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--accent-glow)]">
                    {grp.groupName}
                  </h3>
                  {grp.isHeadcountGroup ? (
                    <span className="tabular-nums text-[11px] font-semibold text-white">
                      razem {Math.round(grp.groupSum)} os.
                    </span>
                  ) : grp.isWeightGroup ? (
                    <span className="tabular-nums text-[11px] text-[var(--ink-muted)]">
                      suma wag: {Math.round(grp.groupSum)}
                    </span>
                  ) : null}
                </div>

                {grp.items.map((ctrl) => {
                  const val = sliderValues[ctrl.controlKey] ?? ctrl.baseValue;
                  const share =
                    grp.isWeightGroup && grp.groupSum > 0
                      ? val / grp.groupSum
                      : grp.isWeightGroup
                        ? 0
                        : undefined;
                  return (
                    <DynamicSliderControl
                      key={ctrl.controlKey}
                      control={ctrl}
                      value={val}
                      normalizedShare={share}
                      onChange={setSliderValue}
                      onReset={resetSlider}
                    />
                  );
                })}
              </div>
            ))}
          </div>

          <p className="text-[11px] leading-relaxed text-[var(--ink-muted)]">
            Każda zmiana mutuje wyłącznie komórki wejściowe (SIM_* lub klucze alokacji) w
            pamięciowym grafie HyperFormula. Formuły modelu i stan otwarcia ({activeDomain.metadata.zeroDate})
            pozostają w 100% nienaruszone.
          </p>
        </div>
      </aside>
    </>
  );
}
