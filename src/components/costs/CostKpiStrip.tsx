import type { CostKpiSummary } from '@/engine/costAnalytics';
import { cn } from '@/lib/utils';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPercent,
  formatPpDelta,
  formatSignedPercent,
} from '@/utils/formatters';

interface CostKpiStripProps {
  kpis: CostKpiSummary;
  currency: string;
  periodLabel: string;
  isAnnual: boolean;
  isSimulationActive: boolean;
}

export function CostKpiStrip({
  kpis,
  currency,
  periodLabel,
  isAnnual,
  isSimulationActive,
}: CostKpiStripProps) {
  const showSimDelta = isSimulationActive;
  const costDeltaSig = Math.abs(kpis.costVsBase) >= 1;
  const netDeltaSig = Math.abs(kpis.netVsBase) >= 1;
  const ratioDeltaSig = Math.abs(kpis.costToRevPpDelta) >= 0.0005;

  return (
    <section
      aria-label="Kluczowe wskaźniki kosztów"
      className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-5"
    >
      {/* 1. Koszty razem */}
      <div className="glass-card flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Koszty razem (przed CIT)
          </div>
          <div
            className="font-display tabular-nums mt-2 text-2xl font-bold text-white"
            title={formatMoneyFull(kpis.totalCost, currency)}
          >
            {formatMoneyCompact(kpis.totalCost, currency)}
          </div>
        </div>
        <div className="mt-2 space-y-0.5 text-xs">
          {showSimDelta && costDeltaSig ? (
            <div
              className={cn(
                'tabular-nums font-medium',
                kpis.costVsBase <= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}
            >
              {kpis.costVsBase >= 0 ? '+' : '−'}
              {formatMoneyCompact(Math.abs(kpis.costVsBase), currency)} vs budżet
            </div>
          ) : null}
          {!isAnnual && kpis.costMomDelta !== null ? (
            <div
              className={cn(
                'tabular-nums',
                kpis.costMomDelta <= 0 ? 'text-emerald-300/90' : 'text-rose-300/90',
              )}
            >
              {kpis.costMomDelta >= 0 ? '+' : '−'}
              {formatMoneyCompact(Math.abs(kpis.costMomDelta), currency)} m/m (
              {kpis.costMomPct !== null ? formatSignedPercent(kpis.costMomPct, 1) : '–'})
            </div>
          ) : (
            <div className="tabular-nums text-[var(--ink-secondary)]">
              Śr. {formatMoneyCompact(kpis.avgMonthlyCost, currency)} / mies.
            </div>
          )}
        </div>
      </div>

      {/* 2. Koszty / Przychody */}
      <div className="glass-card flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Koszty / Przychody
          </div>
          <div
            className={cn(
              'font-display tabular-nums mt-2 text-2xl font-bold',
              kpis.costToRevRatio > 1 ? 'text-rose-300' : 'text-emerald-300',
            )}
          >
            {formatPercent(kpis.costToRevRatio, 1)}
          </div>
        </div>
        <div className="mt-2 space-y-0.5 text-xs">
          <div className="tabular-nums text-[var(--ink-secondary)]">
            Przychody: {formatMoneyCompact(kpis.revenue, currency)}
          </div>
          {showSimDelta && ratioDeltaSig ? (
            <div
              className={cn(
                'tabular-nums font-medium',
                kpis.costToRevPpDelta <= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}
            >
              {formatPpDelta(kpis.costToRevPpDelta, 1)} vs budżet
            </div>
          ) : (
            <div className="text-[var(--ink-muted)]">{periodLabel}</div>
          )}
        </div>
      </div>

      {/* 3. Wynik netto */}
      <div className="glass-card flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Wynik netto
          </div>
          <div
            className={cn(
              'font-display tabular-nums mt-2 text-2xl font-bold',
              kpis.isProfit ? 'text-emerald-300' : 'text-rose-300',
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
          {showSimDelta && netDeltaSig ? (
            <div
              className={cn(
                'tabular-nums font-medium',
                kpis.netVsBase >= 0 ? 'text-emerald-300' : 'text-rose-300',
              )}
            >
              {kpis.netVsBase >= 0 ? '+' : '−'}
              {formatMoneyCompact(Math.abs(kpis.netVsBase), currency)} vs budżet
            </div>
          ) : (
            <div className="text-[var(--ink-muted)]">
              {kpis.isProfit ? 'okres rentowny' : 'strata netto'}
            </div>
          )}
        </div>
      </div>

      {/* 4. Największy dział */}
      <div className="glass-card flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Największy dział
          </div>
          {kpis.topDept ? (
            <div className="mt-2 flex items-center gap-2">
              <span
                className="h-3 w-3 shrink-0 rounded-sm"
                style={{ backgroundColor: kpis.topDept.colorHex }}
              />
              <span className="font-display truncate text-lg font-bold text-white sm:text-xl">
                {kpis.topDept.name}
              </span>
            </div>
          ) : (
            <div className="mt-2 text-lg font-bold text-white">–</div>
          )}
        </div>
        {kpis.topDept ? (
          <div className="mt-2 space-y-0.5 text-xs">
            <div className="tabular-nums font-medium text-white">
              {formatPercent(kpis.topDept.share, 1)} udziału
            </div>
            <div className="tabular-nums text-[var(--ink-secondary)]">
              {formatMoneyCompact(kpis.topDept.amount, currency)}
            </div>
          </div>
        ) : null}
      </div>

      {/* 5. Zmienne vs Stałe */}
      <div className="glass-card flex flex-col justify-between p-4 sm:p-5">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
            Zmienne vs stałe
          </div>
          <div className="font-display tabular-nums mt-2 text-lg font-bold text-white sm:text-xl">
            {formatPercent(kpis.variableShare, 0)} / {formatPercent(kpis.fixedShare, 0)}
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-white/[0.08]">
            <div
              className="h-full bg-sky-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, kpis.variableShare * 100))}%` }}
            />
            <div
              className="h-full bg-violet-400 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, kpis.fixedShare * 100))}%` }}
            />
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-[var(--ink-secondary)]">
          <span className="tabular-nums">
            <span className="text-sky-300">Zm.</span>{' '}
            {formatMoneyCompact(kpis.variableCost)}
          </span>
          <span className="tabular-nums">
            <span className="text-violet-300">St.</span>{' '}
            {formatMoneyCompact(kpis.fixedCost)}
          </span>
        </div>
      </div>
    </section>
  );
}
