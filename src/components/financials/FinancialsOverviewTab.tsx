import { ArrowRight, Lock, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import { DebtLiquidityChart } from '@/components/charts/DebtLiquidityChart';
import { ProfitabilityCashflowChart } from '@/components/charts/ProfitabilityCashflowChart';
import { DynamicSliderControl } from '@/components/simulation/DynamicSliderControl';
import { PresetChips } from '@/components/simulation/PresetChips';
import {
  computeDebtLiquiditySeries,
  computeFinancialOverviewKpis,
  computeProfitabilityCashflowSeries,
} from '@/engine/financialsAnalytics';
import { cn } from '@/lib/utils';
import type { ModelAuditReport } from '@/types/audit';
import type { FinancialDomainModel } from '@/types/financial';
import type { FinancialsSubTab } from '@/types/scenario';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPercent,
  formatPeriodLong,
  formatPpDelta,
} from '@/utils/formatters';

interface FinancialsOverviewTabProps {
  activeDomain: FinancialDomainModel;
  baseDomain: FinancialDomainModel | null;
  activeAudit: ModelAuditReport | null;
  selectedPeriod: number;
  isSimulationActive: boolean;
  sliderValues: Record<string, number>;
  onSelectPeriod: (periodIdx: number) => void;
  onChangeSlider: (controlKey: string, value: number) => void;
  onResetSlider: (controlKey: string) => void;
  onOpenDrawer: () => void;
  onSwitchSubTab: (tab: FinancialsSubTab) => void;
}

export function FinancialsOverviewTab({
  activeDomain,
  baseDomain,
  activeAudit,
  selectedPeriod,
  isSimulationActive,
  sliderValues,
  onSelectPeriod,
  onChangeSlider,
  onResetSlider,
  onOpenDrawer,
  onSwitchSubTab,
}: FinancialsOverviewTabProps) {
  const currency = activeDomain.metadata.currency || 'PLN';
  const periods = activeDomain.metadata.periodHeaders;
  const isAnnual = selectedPeriod < 0;
  const periodLabel = isAnnual
    ? `Cały okres (${periods.length}M)`
    : formatPeriodLong(periods[selectedPeriod] ?? '');
  const endPointLabel = isAnnual
    ? formatPeriodLong(periods[periods.length - 1] ?? '')
    : periodLabel;

  const kpis = computeFinancialOverviewKpis(
    activeDomain,
    baseDomain,
    activeAudit,
    selectedPeriod,
  );
  const debtSeries = computeDebtLiquiditySeries(activeDomain, baseDomain);
  const profSeries = computeProfitabilityCashflowSeries(activeDomain);

  const quickSliders = activeDomain.sliderControls.filter((c) => c.quickBar);

  // Skróty 3 sprawozdań
  const plCm = activeDomain.pl.byCode.PL_CONTRIB_MARGIN;
  const plCmVal = isAnnual ? (plCm?.yearValue ?? 0) : (plCm?.months[selectedPeriod] ?? 0);
  const plEbit = activeDomain.pl.byCode.PL_EBIT;
  const plEbitVal = isAnnual ? (plEbit?.yearValue ?? 0) : (plEbit?.months[selectedPeriod] ?? 0);

  const bsAssets = activeDomain.bs.byCode.BS_ASSETS_TOTAL;
  const bsEquity = activeDomain.bs.byCode.BS_EQUITY;
  const bsIdx =
    selectedPeriod >= 0 && selectedPeriod < periods.length
      ? selectedPeriod
      : Math.max(0, periods.length - 1);
  const bsAssetsZero = bsAssets?.zeroValue ?? 0;
  const bsAssetsCur = bsAssets?.months[bsIdx] ?? 0;
  const bsEquityCur = bsEquity?.months[bsIdx] ?? 0;

  const cfCfo = activeDomain.cf.byCode.CF_CFO;
  const cfCfi = activeDomain.cf.byCode.CF_CFI;
  const cfCff = activeDomain.cf.byCode.CF_CFF;
  const cfCfoVal = isAnnual ? (cfCfo?.yearValue ?? 0) : (cfCfo?.months[selectedPeriod] ?? 0);
  const cfCfiVal = isAnnual ? (cfCfi?.yearValue ?? 0) : (cfCfi?.months[selectedPeriod] ?? 0);
  const cfCffVal = isAnnual ? (cfCff?.yearValue ?? 0) : (cfCff?.months[selectedPeriod] ?? 0);

  return (
    <div className="flex flex-col gap-4">
      {/* 6 kart KPI wykonawczych */}
      <section
        aria-label="Kluczowe wskaźniki sprawozdań i płynności"
        className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
      >
        {/* 1. Przychody */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Przychody ({isAnnual ? 'Okres' : periodLabel})
            </div>
            <div
              className="font-display tabular-nums mt-2 text-xl font-bold text-white"
              title={formatMoneyFull(kpis.revenue, currency)}
            >
              {formatMoneyCompact(kpis.revenue, currency)}
            </div>
          </div>
          <div className="mt-2 text-xs">
            {isSimulationActive && Math.abs(kpis.revenueDelta) >= 1 ? (
              <span
                className={cn(
                  'tabular-nums font-medium',
                  kpis.revenueDelta >= 0 ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {kpis.revenueDelta >= 0 ? '+' : '−'}
                {formatMoneyCompact(Math.abs(kpis.revenueDelta), currency)} vs budżet
              </span>
            ) : (
              <span className="text-[var(--ink-muted)]">budżet bazowy</span>
            )}
          </div>
        </div>

        {/* 2. EBITDA */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              EBITDA / Marża
            </div>
            <div
              className={cn(
                'font-display tabular-nums mt-2 text-xl font-bold',
                kpis.ebitda >= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}
              title={formatMoneyFull(kpis.ebitda, currency)}
            >
              {formatMoneyCompact(kpis.ebitda, currency)}
            </div>
          </div>
          <div className="mt-2 space-y-0.5 text-xs">
            <div className="tabular-nums text-[var(--ink-secondary)]">
              Marża: {formatPercent(kpis.ebitdaMargin, 1)}
            </div>
            {isSimulationActive && Math.abs(kpis.ebitdaDelta) >= 1 ? (
              <div
                className={cn(
                  'tabular-nums font-medium',
                  kpis.ebitdaDelta >= 0 ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {formatPpDelta(kpis.ebitdaMargin - kpis.baseEbitdaMargin, 1)} vs budżet
              </div>
            ) : null}
          </div>
        </div>

        {/* 3. Wynik netto */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Wynik netto
            </div>
            <div
              className={cn(
                'font-display tabular-nums mt-2 text-xl font-bold',
                kpis.netIncome >= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}
              title={formatMoneyFull(kpis.netIncome, currency)}
            >
              {formatMoneyCompact(kpis.netIncome, currency)}
            </div>
          </div>
          <div className="mt-2 space-y-0.5 text-xs">
            <div className="tabular-nums text-[var(--ink-secondary)]">
              Marża netto: {formatPercent(kpis.netMargin, 1)}
            </div>
            {isSimulationActive && Math.abs(kpis.netIncomeDelta) >= 1 ? (
              <div
                className={cn(
                  'tabular-nums font-medium',
                  kpis.netIncomeDelta >= 0 ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {kpis.netIncomeDelta >= 0 ? '+' : '−'}
                {formatMoneyCompact(Math.abs(kpis.netIncomeDelta), currency)} vs budżet
              </div>
            ) : null}
          </div>
        </div>

        {/* 4. Gotówka na koniec */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Gotówka ({endPointLabel})
            </div>
            <div
              className="font-display tabular-nums mt-2 text-xl font-bold text-emerald-300"
              title={formatMoneyFull(kpis.cashEnd, currency)}
            >
              {formatMoneyCompact(kpis.cashEnd, currency)}
            </div>
          </div>
          <div className="mt-2 space-y-0.5 text-xs">
            <div className="tabular-nums text-[var(--ink-secondary)]">
              Min. w okresie: {formatMoneyCompact(kpis.minCashSeries, currency)}
            </div>
            <div className="tabular-nums text-[var(--ink-muted)]">
              Próg min.: {formatMoneyCompact(kpis.minCashThreshold, currency)}
            </div>
          </div>
        </div>

        {/* 5. Szczyt overdraftu */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Szczyt Overdraftu
            </div>
            <div
              className={cn(
                'font-display tabular-nums mt-2 text-xl font-bold',
                kpis.peakOverdraftUtilization >= 0.85
                  ? 'text-rose-300'
                  : kpis.peakOverdraftUtilization >= 0.65
                    ? 'text-amber-300'
                    : 'text-white',
              )}
              title={formatMoneyFull(kpis.peakOverdraft, currency)}
            >
              {formatMoneyCompact(kpis.peakOverdraft, currency)}
            </div>
          </div>
          <div className="mt-2 space-y-1 text-xs">
            <div className="tabular-nums text-[var(--ink-secondary)]">
              {formatPercent(kpis.peakOverdraftUtilization, 1)} z limitu{' '}
              {formatMoneyCompact(kpis.overdraftLimit)}
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  kpis.peakOverdraftUtilization >= 0.85
                    ? 'bg-rose-400'
                    : kpis.peakOverdraftUtilization >= 0.65
                      ? 'bg-amber-400'
                      : 'bg-sky-400',
                )}
                style={{
                  width: `${Math.min(100, Math.max(0, kpis.peakOverdraftUtilization * 100))}%`,
                }}
              />
            </div>
          </div>
        </div>

        {/* 6. Dług netto & Pożyczka wspólników */}
        <div className="glass-card flex flex-col justify-between p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
              Dług netto ({endPointLabel})
            </div>
            <div
              className="font-display tabular-nums mt-2 text-xl font-bold text-white"
              title={formatMoneyFull(kpis.netDebtEnd, currency)}
            >
              {formatMoneyCompact(kpis.netDebtEnd, currency)}
            </div>
          </div>
          <div className="mt-2 space-y-0.5 text-xs">
            <div
              className={cn(
                'tabular-nums font-medium',
                kpis.peakShareholderLoan > 1 ? 'text-amber-300' : 'text-[var(--ink-secondary)]',
              )}
            >
              Pożyczka wspóln. (max):{' '}
              {formatMoneyCompact(kpis.peakShareholderLoan, currency)}
            </div>
            {isSimulationActive && Math.abs(kpis.netDebtDelta) >= 1 ? (
              <div
                className={cn(
                  'tabular-nums',
                  kpis.netDebtDelta <= 0 ? 'text-emerald-300' : 'text-rose-300',
                )}
              >
                {kpis.netDebtDelta >= 0 ? '+' : '−'}
                {formatMoneyCompact(Math.abs(kpis.netDebtDelta), currency)} vs budżet
              </div>
            ) : null}
          </div>
        </div>
      </section>

      {/* Szybka symulacja sprawozdań What-If (QuickBar + Presety) */}
      <section className="glass-card p-5" aria-label="Szybka symulacja What-If">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Szybka symulacja sprawozdań (QuickBar · HyperFormula Live)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
              Zmiany przeliczają równolegle RZiS, Bilans (z zablokowanym Momentem zero) oraz Cash Flow.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenDrawer}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/50 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500/25"
          >
            <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" />
            Wszystkie założenia ({activeDomain.sliderControls.length})
          </button>
        </div>

        <PresetChips />

        {quickSliders.length > 0 ? (
          <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 border-t border-white/10 pt-3 md:grid-cols-2 lg:grid-cols-3">
            {quickSliders.map((ctrl) => (
              <DynamicSliderControl
                key={ctrl.controlKey}
                control={ctrl}
                value={sliderValues[ctrl.controlKey] ?? ctrl.baseValue}
                onChange={onChangeSlider}
                onReset={onResetSlider}
              />
            ))}
          </div>
        ) : null}
      </section>

      {/* Wykresy: Zadłużenie/Płynność oraz Wyniki vs CFO */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <DebtLiquidityChart
          series={debtSeries}
          currency={currency}
          selectedPeriod={selectedPeriod}
          isSimulationActive={isSimulationActive}
          onSelectPeriod={onSelectPeriod}
        />
        <ProfitabilityCashflowChart
          series={profSeries}
          currency={currency}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={onSelectPeriod}
        />
      </div>

      {/* Skrót 3 sprawozdań + kontrola integralności */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* RZiS */}
        <div className="glass-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-white">
                Rachunek Zysków i Strat · {periodLabel}
              </h3>
            </div>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Przychody ze sprzedaży</dt>
                <dd className="tabular-nums font-semibold text-white">
                  {formatMoneyCompact(kpis.revenue, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Marża po kosztach zmiennych</dt>
                <dd className="tabular-nums font-semibold text-white">
                  {formatMoneyCompact(plCmVal, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">EBIT</dt>
                <dd
                  className={cn(
                    'tabular-nums font-semibold',
                    plEbitVal >= 0 ? 'text-emerald-300' : 'text-rose-300',
                  )}
                >
                  {formatMoneyCompact(plEbitVal, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-secondary)]">Wynik netto</dt>
                <dd
                  className={cn(
                    'tabular-nums font-bold',
                    kpis.netIncome >= 0 ? 'text-emerald-300' : 'text-rose-300',
                  )}
                >
                  {formatMoneyCompact(kpis.netIncome, currency)}
                </dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={() => onSwitchSubTab('pl')}
            className="mt-4 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
          >
            Otwórz pełny RZiS <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Bilans */}
        <div className="glass-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-white">
                Bilans ({endPointLabel})
              </h3>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-400/35 bg-sky-500/10 px-2 py-0.5 text-[10px] font-semibold text-sky-200">
                <Lock className="h-3 w-3" /> Moment 0 zablokowany
              </span>
            </div>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">
                  Suma bilansowa ({activeDomain.metadata.zeroDate})
                </dt>
                <dd className="tabular-nums font-semibold text-sky-200">
                  {formatMoneyCompact(bsAssetsZero, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Suma bilansowa ({endPointLabel})</dt>
                <dd className="tabular-nums font-semibold text-white">
                  {formatMoneyCompact(bsAssetsCur, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Kapitały własne</dt>
                <dd
                  className={cn(
                    'tabular-nums font-semibold',
                    bsEquityCur >= 0 ? 'text-white' : 'text-rose-300',
                  )}
                >
                  {formatMoneyCompact(bsEquityCur, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-secondary)]">Kontrola max |A − P|</dt>
                <dd className="font-mono-num inline-flex items-center gap-1 font-semibold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {kpis.maxBalanceDiff.toFixed(4)} {currency}
                </dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={() => onSwitchSubTab('bs')}
            className="mt-4 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
          >
            Otwórz pełny Bilans <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Cash Flow */}
        <div className="glass-card flex flex-col justify-between p-5">
          <div>
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-white">
                Cash Flow · {periodLabel}
              </h3>
            </div>
            <dl className="mt-3 space-y-2 text-xs sm:text-sm">
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Przepływy operacyjne (CFO)</dt>
                <dd
                  className={cn(
                    'tabular-nums font-semibold',
                    cfCfoVal >= 0 ? 'text-emerald-300' : 'text-rose-300',
                  )}
                >
                  {formatMoneyCompact(cfCfoVal, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Przepływy inwestycyjne (CFI)</dt>
                <dd
                  className={cn(
                    'tabular-nums font-semibold',
                    cfCfiVal >= 0 ? 'text-emerald-300' : 'text-rose-300',
                  )}
                >
                  {formatMoneyCompact(cfCfiVal, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3 border-b border-white/[0.07] pb-1.5">
                <dt className="text-[var(--ink-secondary)]">Przepływy finansowe (CFF)</dt>
                <dd className="tabular-nums font-semibold text-white">
                  {formatMoneyCompact(cfCffVal, currency)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-[var(--ink-secondary)]">Uzgodnienie max |CF − Bilans|</dt>
                <dd className="font-mono-num inline-flex items-center gap-1 font-semibold text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  {kpis.maxCfVsBsDiff.toFixed(4)} {currency}
                </dd>
              </div>
            </dl>
          </div>
          <button
            type="button"
            onClick={() => onSwitchSubTab('cf')}
            className="mt-4 inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-sky-200 transition hover:border-sky-400/50 hover:bg-sky-500/15"
          >
            Otwórz pełny Cash Flow <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
}
