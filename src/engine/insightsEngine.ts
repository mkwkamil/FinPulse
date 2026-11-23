import type { ModelAuditReport } from '@/types/audit';
import type { FinancialDomainModel } from '@/types/financial';
import {
  formatMoneyCompact,
  formatPeriodLong,
  formatPercent,
  formatSignedPercent,
} from '@/utils/formatters';
import {
  computeCategoryBreakdown,
  computeCostKpis,
  computeDeptBreakdown,
  getCostLineValue,
  getStatementValue,
} from './costAnalytics';

export interface InsightSegment {
  text: string;
  bold?: boolean;
  highlight?: 'pos' | 'neg' | 'sim';
}

export interface CostInsight {
  id: string;
  tone: 'neutral' | 'positive' | 'warning' | 'simulation';
  segments: InsightSegment[];
}

export interface GenerateCostInsightsInput {
  activeDomain: FinancialDomainModel;
  baseDomain: FinancialDomainModel | null;
  activeAudit: ModelAuditReport | null;
  periodIdx: number;
  selectedDeptCode: string | null;
  isSimulationActive: boolean;
}

export function generateCostInsights({
  activeDomain,
  baseDomain,
  activeAudit,
  periodIdx,
  selectedDeptCode,
  isSimulationActive,
}: GenerateCostInsightsInput): CostInsight[] {
  const insights: CostInsight[] = [];
  const currency = activeDomain.metadata.currency || 'PLN';
  const periods = activeDomain.metadata.periodHeaders;
  const kpis = computeCostKpis(activeDomain, baseDomain, periodIdx);
  const depts = computeDeptBreakdown(activeDomain, baseDomain, periodIdx);
  const cats = computeCategoryBreakdown(activeDomain, baseDomain, periodIdx, selectedDeptCode);

  // 1. Koncentracja działowa
  if (depts.length >= 2) {
    const top1 = depts[0];
    const top2 = depts[1];
    const top2Share = top1.share + top2.share;
    insights.push({
      id: 'dept-concentration',
      tone: 'neutral',
      segments: [
        { text: 'Koncentracja kosztów: ', bold: true },
        { text: `${top1.name} (${formatPercent(top1.share)})`, bold: true },
        { text: ' oraz ' },
        { text: `${top2.name} (${formatPercent(top2.share)})`, bold: true },
        { text: ' odpowiadają łącznie za ' },
        { text: formatPercent(top2Share), bold: true },
        { text: ' bazy kosztowej (' },
        { text: formatMoneyCompact(top1.amount + top2.amount, currency), bold: true },
        { text: ').' },
      ],
    });
  } else if (depts.length === 1) {
    const top1 = depts[0];
    insights.push({
      id: 'dept-concentration',
      tone: 'neutral',
      segments: [
        { text: 'Struktura działowa: ', bold: true },
        { text: `${top1.name} skupia 100% kosztów (` },
        { text: formatMoneyCompact(top1.amount, currency), bold: true },
        { text: ').' },
      ],
    });
  }

  // 2. Dynamika m/m lub profil sezonowości całego okresu
  if (periodIdx > 0 && kpis.costMomDelta !== null) {
    const prevIdx = periodIdx - 1;
    let topDriverName = '';
    let topDriverDelta = 0;
    for (const line of activeDomain.allocation.costLines) {
      const d = getCostLineValue(line, periodIdx) - getCostLineValue(line, prevIdx);
      if (Math.abs(d) > Math.abs(topDriverDelta)) {
        topDriverDelta = d;
        topDriverName = line.lineName;
      }
    }
    const direction = kpis.costMomDelta >= 0 ? 'wzrosły' : 'spadły';
    const pctPart =
      kpis.costMomPct !== null ? ` (${formatSignedPercent(kpis.costMomPct, 1)})` : '';
    const segs: InsightSegment[] = [
      { text: 'Dynamika m/m: ', bold: true },
      { text: `koszty ogółem ${direction} o ` },
      {
        text: `${formatMoneyCompact(Math.abs(kpis.costMomDelta), currency)}${pctPart}`,
        bold: true,
        highlight: kpis.costMomDelta <= 0 ? 'pos' : 'neg',
      },
      { text: ` vs ${formatPeriodLong(periods[prevIdx] ?? '')}` },
    ];
    if (topDriverName && Math.abs(topDriverDelta) >= 1) {
      const signTxt = topDriverDelta >= 0 ? '+' : '−';
      segs.push({ text: ' — główny czynnik: ' });
      segs.push({
        text: `${topDriverName} (${signTxt}${formatMoneyCompact(Math.abs(topDriverDelta), currency)})`,
        bold: true,
      });
    }
    segs.push({ text: '.' });
    insights.push({
      id: 'mom-dynamics',
      tone: kpis.costMomDelta <= 0 ? 'positive' : 'warning',
      segments: segs,
    });
  } else if (periodIdx < 0 && periods.length > 0) {
    let peakIdx = 0;
    let peakVal = -Infinity;
    for (let i = 0; i < periods.length; i++) {
      const mTotal = activeDomain.allocation.deptCosts.reduce(
        (acc, d) => acc + (d.months[i] ?? 0),
        0,
      );
      if (mTotal > peakVal) {
        peakVal = mTotal;
        peakIdx = i;
      }
    }
    insights.push({
      id: 'annual-peak',
      tone: 'neutral',
      segments: [
        { text: 'Profil całego okresu: ', bold: true },
        { text: 'średni koszt miesięczny wynosi ' },
        { text: formatMoneyCompact(kpis.avgMonthlyCost, currency), bold: true },
        { text: ', a szczyt wydatków przypada na ' },
        { text: formatPeriodLong(periods[peakIdx] ?? ''), bold: true },
        { text: ' (' },
        { text: formatMoneyCompact(peakVal, currency), bold: true },
        { text: ').' },
      ],
    });
  } else if (periodIdx === 0) {
    const diffAvg = kpis.totalCost - kpis.avgMonthlyCost;
    insights.push({
      id: 'opening-month',
      tone: 'neutral',
      segments: [
        { text: 'Otwarcie okresu: ', bold: true },
        { text: 'koszty startowe wynoszą ' },
        { text: formatMoneyCompact(kpis.totalCost, currency), bold: true },
        {
          text:
            diffAvg >= 0
              ? ` (powyżej średniej miesięcznej o ${formatMoneyCompact(diffAvg, currency)}).`
              : ` (poniżej średniej miesięcznej o ${formatMoneyCompact(Math.abs(diffAvg), currency)}).`,
        },
      ],
    });
  }

  // 3. Relacja kosztów do przychodów i wynik netto
  insights.push({
    id: 'profitability',
    tone: kpis.isProfit ? 'positive' : 'warning',
    segments: [
      { text: 'Rentowność okresu: ', bold: true },
      { text: 'koszty stanowią ' },
      {
        text: formatPercent(kpis.costToRevRatio, 1),
        bold: true,
        highlight: kpis.costToRevRatio <= 1 ? 'pos' : 'neg',
      },
      { text: ' przychodów (' },
      { text: formatMoneyCompact(kpis.revenue, currency), bold: true },
      { text: '); wynik netto wynosi ' },
      {
        text: formatMoneyCompact(kpis.netIncome, currency),
        bold: true,
        highlight: kpis.isProfit ? 'pos' : 'neg',
      },
      { text: ` (marża ${formatPercent(kpis.netMargin, 1)}).` },
    ],
  });

  // 4. Próg rentowności (Break-Even Revenue) na bazie RZiS z HyperFormula
  const grant = getStatementValue(activeDomain.pl, 'PL_GRANT_RELEASE', periodIdx);
  const depr = getStatementValue(activeDomain.pl, 'PL_DEPR', periodIdx);
  const fin = getStatementValue(activeDomain.pl, 'PL_FIN_TOTAL', periodIdx);
  const plFixed = getStatementValue(activeDomain.pl, 'PL_FIX_TOTAL', periodIdx);
  const plVar = getStatementValue(activeDomain.pl, 'PL_VAR_TOTAL', periodIdx);
  const cm = kpis.revenue - plVar;
  const cmRatio = Math.abs(kpis.revenue) > 1e-6 ? cm / kpis.revenue : 0;

  if (cmRatio > 0.005) {
    const fixedBeforeTax = Math.max(0, plFixed + depr + fin - grant);
    const beRevenue = fixedBeforeTax / cmRatio;
    const revGap = kpis.revenue - beRevenue;
    insights.push({
      id: 'break-even',
      tone: revGap >= 0 ? 'positive' : 'warning',
      segments: [
        { text: 'Próg rentowności (Break-Even): ', bold: true },
        { text: 'przy marży zmiennej ' },
        { text: formatPercent(cmRatio, 1), bold: true },
        { text: ' wymagany przychód wynosi ' },
        { text: formatMoneyCompact(beRevenue, currency), bold: true },
        {
          text:
            revGap >= 0
              ? ` — bezpieczny bufor +${formatMoneyCompact(revGap, currency)}.`
              : ` — brakuje ${formatMoneyCompact(Math.abs(revGap), currency)} do zera przed CIT.`,
          bold: true,
          highlight: revGap >= 0 ? 'pos' : 'neg',
        },
      ],
    });
  }

  // 5. Dominująca kategoria (uwzględnia ewentualny filtr działu)
  if (cats.length > 0) {
    const topCat = cats[0];
    const scopeLabel = selectedDeptCode
      ? activeDomain.allocation.departments.find((d) => d.code === selectedDeptCode)?.name ??
        selectedDeptCode
      : 'całej spółki';
    insights.push({
      id: 'top-category',
      tone: 'neutral',
      segments: [
        { text: `Największa kategoria (${scopeLabel}): `, bold: true },
        { text: topCat.name, bold: true },
        { text: ' — ' },
        { text: formatMoneyCompact(topCat.amount, currency), bold: true },
        { text: ` (${formatPercent(topCat.share, 1)} analizowanego koszyka).` },
      ],
    });
  }

  // 6. Podsumowanie aktywnej symulacji What-If
  if (isSimulationActive) {
    const netDelta = kpis.netVsBase;
    const costDelta = kpis.costVsBase;
    const ovMax = activeAudit?.covenants.maxOverdraft ?? 0;
    const ovUtil = activeAudit?.covenants.maxOverdraftUtilization ?? 0;
    insights.push({
      id: 'simulation-impact',
      tone: 'simulation',
      segments: [
        { text: 'Wpływ symulacji What-If: ', bold: true, highlight: 'sim' },
        { text: 'wynik netto zmienia się o ' },
        {
          text: `${netDelta >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(netDelta), currency)}`,
          bold: true,
          highlight: netDelta >= 0 ? 'pos' : 'neg',
        },
        { text: ', koszty o ' },
        {
          text: `${costDelta >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(costDelta), currency)}`,
          bold: true,
          highlight: costDelta <= 0 ? 'pos' : 'neg',
        },
        { text: `; szczyt overdraftu w modelu: ` },
        {
          text: `${formatMoneyCompact(ovMax, currency)} (${formatPercent(ovUtil, 1)} limitu).`,
          bold: true,
        },
      ],
    });
  }

  return insights;
}
