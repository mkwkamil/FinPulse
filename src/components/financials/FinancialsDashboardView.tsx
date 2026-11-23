import { Lock, ShieldAlert, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { FinancialStatementTable } from '@/components/financials/FinancialStatementTable';
import { FinancialsOverviewTab } from '@/components/financials/FinancialsOverviewTab';
import { RatiosViewTab } from '@/components/financials/RatiosViewTab';
import { cn } from '@/lib/utils';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { FinancialsSubTab } from '@/types/scenario';
import { formatPeriodLong } from '@/utils/formatters';

const FINANCIALS_TABS: Array<{ id: FinancialsSubTab; label: string; lockIcon?: boolean }> = [
  { id: 'overview', label: 'Przegląd' },
  { id: 'pl', label: 'RZiS (P&L)' },
  { id: 'bs', label: 'Bilans', lockIcon: true },
  { id: 'cf', label: 'Cash Flow' },
  { id: 'ratios', label: 'Wskaźniki' },
];

export function FinancialsDashboardView() {
  const activeDomain = useFinPulseStore((s) => s.activeDomain);
  const baseDomain = useFinPulseStore((s) => s.baseDomain);
  const activeAudit = useFinPulseStore((s) => s.activeAudit);
  const financialsTab = useFinPulseStore((s) => s.financialsTab);
  const selectedPeriod = useFinPulseStore((s) => s.selectedPeriod);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);
  const sliderValues = useFinPulseStore((s) => s.sliderValues);

  const setFinancialsTab = useFinPulseStore((s) => s.setFinancialsTab);
  const setSelectedPeriod = useFinPulseStore((s) => s.setSelectedPeriod);
  const setSliderValue = useFinPulseStore((s) => s.setSliderValue);
  const resetSlider = useFinPulseStore((s) => s.resetSlider);
  const setDrawerOpen = useFinPulseStore((s) => s.setDrawerOpen);

  if (!activeDomain) return null;

  const currency = activeDomain.metadata.currency || 'PLN';
  const periods = activeDomain.metadata.periodHeaders;
  const periodLabel =
    selectedPeriod < 0
      ? `Cały okres (${periods.length}M)`
      : formatPeriodLong(periods[selectedPeriod] ?? '');

  const bsBalanced = (activeAudit?.integrity.maxBalanceDiff ?? 0) <= 0.01;
  const cfBalanced = (activeAudit?.integrity.maxCfVsBsDiff ?? 0) <= 0.01;

  return (
    <div className="flex flex-col gap-4">
      {/* Pasek podzakładek i statusu 3 sprawozdań */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Podzakładki przeglądu finansowego"
          className="glass-card inline-flex flex-wrap gap-1 rounded-full p-1"
        >
          {FINANCIALS_TABS.map((tab) => {
            const active = financialsTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFinancialsTab(tab.id)}
                className={cn(
                  'inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition sm:text-sm',
                  active
                    ? 'bg-sky-500/30 text-white shadow-[0_0_14px_rgba(74,163,255,0.3)]'
                    : 'text-[var(--ink-secondary)] hover:text-white',
                )}
              >
                {tab.lockIcon ? <Lock className="h-3 w-3 text-sky-300" /> : null}
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold',
              bsBalanced && cfBalanced
                ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300'
                : 'border-rose-400/45 bg-rose-500/15 text-rose-200',
            )}
          >
            {bsBalanced && cfBalanced ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <ShieldAlert className="h-3.5 w-3.5" />
            )}
            {bsBalanced && cfBalanced
              ? 'Aktywa = Pasywa · CF = Bilans'
              : 'Wykryto rozbieżność sprawozdań'}
          </span>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/45 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500/25"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" />
            Panel symulacji ({activeDomain.sliderControls.length})
          </button>
        </div>
      </div>

      {/* Aktywna podzakładka */}
      {financialsTab === 'overview' ? (
        <FinancialsOverviewTab
          activeDomain={activeDomain}
          baseDomain={baseDomain}
          activeAudit={activeAudit}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          sliderValues={sliderValues}
          onSelectPeriod={setSelectedPeriod}
          onChangeSlider={setSliderValue}
          onResetSlider={resetSlider}
          onOpenDrawer={() => setDrawerOpen(true)}
          onSwitchSubTab={setFinancialsTab}
        />
      ) : financialsTab === 'pl' ? (
        <FinancialStatementTable
          title={`Rachunek Zysków i Strat (04_RZiS) · ${periodLabel}`}
          subtitle="Wszystkie przychody, koszty i podatki przeliczane na żywo przez HyperFormula. Kliknij nagłówek miesiąca, aby zmienić okres."
          statementKind="pl"
          activeTable={activeDomain.pl}
          baseTable={baseDomain?.pl ?? null}
          currency={currency}
          zeroDate={activeDomain.metadata.zeroDate}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          onSelectPeriod={setSelectedPeriod}
        />
      ) : financialsTab === 'bs' ? (
        <FinancialStatementTable
          title="Bilans (05_Bilans — stan na koniec okresu)"
          subtitle="Równowaga Aktywa = Pasywa egzekwowana na każdym etapie symulacji What-If."
          statementKind="bs"
          activeTable={activeDomain.bs}
          baseTable={baseDomain?.bs ?? null}
          currency={currency}
          zeroDate={activeDomain.metadata.zeroDate}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          onSelectPeriod={setSelectedPeriod}
          headerExtra={
            <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/40 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-sky-200">
              <Lock className="h-3 w-3" />
              Moment zero ({activeDomain.metadata.zeroDate}) zamrożony
            </span>
          }
        />
      ) : financialsTab === 'cf' ? (
        <FinancialStatementTable
          title={`Rachunek Przepływów Pieniężnych (06_CashFlow) · ${periodLabel}`}
          subtitle="Metoda pośrednia z automatycznym mechanizmem pokrycia niedoboru overdraftem i pożyczką wspólników."
          statementKind="cf"
          activeTable={activeDomain.cf}
          baseTable={baseDomain?.cf ?? null}
          currency={currency}
          zeroDate={activeDomain.metadata.zeroDate}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          onSelectPeriod={setSelectedPeriod}
        />
      ) : (
        <RatiosViewTab
          activeDomain={activeDomain}
          baseDomain={baseDomain}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          onSelectPeriod={setSelectedPeriod}
        />
      )}
    </div>
  );
}
