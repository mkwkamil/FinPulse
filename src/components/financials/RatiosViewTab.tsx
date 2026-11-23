import { ShieldAlert, ShieldCheck } from 'lucide-react';
import { FinancialStatementTable } from '@/components/financials/FinancialStatementTable';
import { computeRatioHighlights } from '@/engine/financialsAnalytics';
import { cn } from '@/lib/utils';
import type { FinancialDomainModel, StatementRowType } from '@/types/financial';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatNumber,
  formatPercent,
  formatPeriodLong,
  formatPpDelta,
  formatRatio,
} from '@/utils/formatters';

interface RatiosViewTabProps {
  activeDomain: FinancialDomainModel;
  baseDomain: FinancialDomainModel | null;
  selectedPeriod: number;
  isSimulationActive: boolean;
  onSelectPeriod: (periodIdx: number) => void;
}

function formatRatioCardVal(
  rowType: StatementRowType,
  value: number,
  currency: string,
): string {
  if (rowType === 'PCT') return formatPercent(value, 1);
  if (rowType === 'RATIO') return formatRatio(value, 2, 'x');
  if (rowType === 'DAYS') return `${formatNumber(value, 1)} dni`;
  return formatMoneyCompact(value, currency);
}

function formatRatioCardDelta(
  rowType: StatementRowType,
  delta: number,
  currency: string,
): string | null {
  if (rowType === 'PCT') {
    if (Math.abs(delta) < 0.0005) return null;
    return formatPpDelta(delta, 1);
  }
  if (rowType === 'RATIO') {
    if (Math.abs(delta) < 0.005) return null;
    return `${delta >= 0 ? '+' : ''}${formatNumber(delta, 2)}x`;
  }
  if (rowType === 'DAYS') {
    if (Math.abs(delta) < 0.05) return null;
    return `${delta >= 0 ? '+' : ''}${formatNumber(delta, 1)} dni`;
  }
  if (Math.abs(delta) < 1) return null;
  return `${delta >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(delta), currency)}`;
}

export function RatiosViewTab({
  activeDomain,
  baseDomain,
  selectedPeriod,
  isSimulationActive,
  onSelectPeriod,
}: RatiosViewTabProps) {
  const currency = activeDomain.metadata.currency || 'PLN';
  const periods = activeDomain.metadata.periodHeaders;
  const pointLabel =
    selectedPeriod >= 0
      ? formatPeriodLong(periods[selectedPeriod] ?? '')
      : `Koniec okresu (${formatPeriodLong(periods[periods.length - 1] ?? '')})`;

  const highlights = computeRatioHighlights(activeDomain, baseDomain, selectedPeriod);

  return (
    <div className="flex flex-col gap-4">
      {/* 6 kart podsumowania wskaźników */}
      {highlights.length > 0 ? (
        <section
          aria-label="Główne wskaźniki płynności, rotacji i zadłużenia"
          className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6"
        >
          {highlights.map((card) => {
            const deltaText = isSimulationActive
              ? formatRatioCardDelta(card.rowType, card.delta, currency)
              : null;
            const valueColor =
              card.health === 'good'
                ? 'text-emerald-300'
                : card.health === 'warn'
                  ? 'text-amber-300'
                  : card.health === 'bad'
                    ? 'text-rose-300'
                    : 'text-white';
            return (
              <div key={card.lineCode} className="glass-card flex flex-col justify-between p-4">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                    {card.shortLabel}
                  </div>
                  <div
                    className={cn('font-display tabular-nums mt-2 text-xl font-bold', valueColor)}
                    title={
                      card.rowType === 'DETAIL'
                        ? formatMoneyFull(card.value, currency)
                        : card.label
                    }
                  >
                    {formatRatioCardVal(card.rowType, card.value, currency)}
                  </div>
                </div>
                <div className="mt-2 space-y-0.5 text-xs">
                  {deltaText ? (
                    <div
                      className={cn(
                        'tabular-nums font-medium',
                        card.deltaTone === 'good'
                          ? 'text-emerald-300'
                          : card.deltaTone === 'bad'
                            ? 'text-rose-300'
                            : 'text-sky-200',
                      )}
                    >
                      {deltaText} vs budżet
                    </div>
                  ) : (
                    <div className="text-[var(--ink-muted)]">{card.thresholdHint}</div>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {/* Pełna tabela 07_Wskazniki */}
      <FinancialStatementTable
        title={`Wskaźniki finansowe i rotacji · ${pointLabel}`}
        subtitle="Rentowność, płynność bieżąca/szybka, dług netto, wykorzystanie overdraftu oraz DSO/DIO (trailing 3M) z arkusza 07_Wskazniki."
        statementKind="ratios"
        activeTable={activeDomain.ratios}
        baseTable={baseDomain?.ratios ?? null}
        currency={currency}
        zeroDate={activeDomain.metadata.zeroDate}
        selectedPeriod={selectedPeriod}
        isSimulationActive={isSimulationActive}
        onSelectPeriod={onSelectPeriod}
      />

      {/* Kontrole z Excela: TBL_AUDIT_CHECKS */}
      {activeDomain.excelAuditChecks.length > 0 ? (
        <section className="glass-card p-5" aria-label="Kontrole integralności z Excela">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="font-display text-base font-semibold text-white">
                Wbudowane kontrole integralności (TBL_AUDIT_CHECKS z arkusza 07_Wskazniki)
              </h3>
              <p className="mt-0.5 text-xs text-[var(--ink-muted)]">
                Wszystkie reguły przeliczane na żywo w HyperFormula równolegle z bramkami Audytora Modelu.
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full min-w-[700px] border-collapse text-xs sm:text-[13px]">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wider text-[var(--ink-muted)]">
                  <th className="px-3 py-2.5 text-left">Reguła kontrolna</th>
                  <th className="px-3 py-2.5 text-center">Poziom</th>
                  <th className="px-3 py-2.5 text-right">Odchylenie / Wartość</th>
                  <th className="px-3 py-2.5 text-right">Tolerancja</th>
                  <th className="px-3 py-2.5 text-center">Status</th>
                </tr>
              </thead>
              <tbody>
                {activeDomain.excelAuditChecks.map((chk) => {
                  const isOk = chk.status.toUpperCase() === 'OK';
                  const isWarn = chk.status.toUpperCase() === 'UWAGA';
                  const decimals = chk.tolerance < 0.01 ? 4 : 2;
                  return (
                    <tr
                      key={chk.checkCode}
                      className="border-b border-white/[0.06] last:border-b-0 hover:bg-white/[0.03]"
                    >
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-white">{chk.checkName}</div>
                        <div className="font-mono-num text-[11px] text-[var(--ink-muted)]">
                          {chk.checkCode}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            'rounded px-2 py-0.5 text-[10px] font-semibold uppercase',
                            chk.severity === 'CRITICAL'
                              ? 'bg-sky-500/15 text-sky-200'
                              : 'bg-amber-500/15 text-amber-200',
                          )}
                        >
                          {chk.severity}
                        </span>
                      </td>
                      <td className="font-mono-num px-3 py-2.5 text-right text-[var(--ink)]">
                        {formatNumber(chk.actualValue, decimals)}
                      </td>
                      <td className="font-mono-num px-3 py-2.5 text-right text-[var(--ink-muted)]">
                        {formatNumber(chk.tolerance, decimals)}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold',
                            isOk
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : isWarn
                                ? 'bg-amber-500/20 text-amber-200'
                                : 'bg-rose-500/20 text-rose-200',
                          )}
                        >
                          {isOk ? (
                            <ShieldCheck className="h-3 w-3" />
                          ) : (
                            <ShieldAlert className="h-3 w-3" />
                          )}
                          {chk.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
