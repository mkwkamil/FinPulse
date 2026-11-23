import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeCategoryBreakdown,
  computeCostKpis,
  computeHeatmapMatrix,
  computeMonthlyTrendSeries,
  computeWaterfallSteps,
} from '@/engine/costAnalytics';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import { generateCostInsights } from '@/engine/insightsEngine';
import type { FinancialDomainModel, StatementRow, StatementTable } from '@/types/financial';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

function insightText(segs: Array<{ text: string }>): string {
  return segs.map((s) => s.text).join('');
}

function makeNonBeta8x10x18Domain(): FinancialDomainModel {
  const periods = 18;
  const periodHeaders = Array.from({ length: periods }, (_, idx) => {
    const y = 2027 + Math.floor(idx / 12);
    const m = String((idx % 12) + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const departments = Array.from({ length: 8 }, (_, i) => ({
    code: `D${i + 1}`,
    name: `Dział ${i + 1}`,
    colorHex: '#3987e5',
    hasHeadcount: true,
    headcount: 5,
    headcountShare: 1 / 8,
    hasRentWeight: true,
    rentWeight: 10,
    rentShare: 1 / 8,
    notes: '',
  }));

  const categories = Array.from({ length: 10 }, (_, i) => ({
    code: `C${i + 1}`,
    name: `Kategoria ${i + 1}`,
    shortName: `Kat ${i + 1}`,
    sortOrder: (i + 1) * 10,
  }));

  const weights: Record<string, number> = {};
  for (const d of departments) weights[d.code] = 1 / 8;

  const matrix = categories.map((cat, idx) => ({
    lineCode: `L_${cat.code}`,
    lineName: `Linia ${idx + 1}`,
    catCode: cat.code,
    costBehavior: idx < 4 ? ('VARIABLE' as const) : ('FIXED' as const),
    allocRule: 'Równo 1/8',
    weights,
    rowSum: 1,
  }));

  const costLines = matrix.map((m, idx) => {
    const monthlyVal = 10_000 * (idx + 1);
    const months = Array.from({ length: periods }, () => monthlyVal);
    return {
      lineCode: m.lineCode,
      lineName: m.lineName,
      catCode: m.catCode,
      costBehavior: m.costBehavior,
      months,
      yearTotal: monthlyVal * periods,
    };
  });

  const totalPerMonth = costLines.reduce((acc, l) => acc + l.months[0], 0); // 550_000
  const deptCosts = departments.map((d) => ({
    deptCode: d.code,
    deptName: d.name,
    months: Array.from({ length: periods }, () => totalPerMonth / 8),
    yearTotal: (totalPerMonth * periods) / 8,
    share: 1 / 8,
  }));

  const makeRow = (
    lineCode: string,
    wfRole: StatementRow['wfRole'],
    label: string,
    monthly: number,
  ): StatementRow => ({
    lineCode,
    rowType: wfRole === 'SUBTOTAL' || wfRole === 'END' ? 'TOTAL' : 'DETAIL',
    aggMode: 'SUM',
    wfRole,
    label,
    zeroValue: null,
    months: Array.from({ length: periods }, () => monthly),
    yearValue: monthly * periods,
  });

  const plRows: StatementRow[] = [
    makeRow('PL_REV_TOTAL', 'START', 'Przychody ze sprzedaży', 700_000),
    makeRow('PL_VAR_TOTAL', 'DELTA_NEG', 'Koszty zmienne', 100_000),
    makeRow('PL_CONTRIB_MARGIN', 'SUBTOTAL', 'Marża zmienna', 600_000),
    makeRow('PL_FIX_TOTAL', 'DELTA_NEG', 'Koszty stałe', 450_000),
    makeRow('PL_EBITDA', 'SUBTOTAL', 'EBITDA', 150_000),
    makeRow('PL_NET_INCOME', 'END', 'Wynik netto', 150_000),
  ];

  const pl: StatementTable = {
    hasZeroColumn: false,
    hasYearColumn: true,
    periodHeaders,
    rows: plRows,
    byCode: Object.fromEntries(plRows.map((r) => [r.lineCode, r])),
  };

  const emptyStmt: StatementTable = {
    hasZeroColumn: false,
    hasYearColumn: true,
    periodHeaders,
    rows: [],
    byCode: {},
  };

  return {
    metadata: {
      schemaVersion: '1.0',
      companyName: 'FLEX 18M',
      budgetTitle: 'Test 8x10x18',
      currency: 'EUR',
      unitScale: 1000,
      zeroDate: '2026-12-31',
      defaultPeriod: 0,
      periodHeaders,
    },
    config: {
      citRate: 0.19,
      overdraftLimit: 1_000_000,
      minCash: 50_000,
      headcountTotal: 40,
      daysInMonth: 30,
      rawUsageFactor: 1,
      onlineShare: 0.2,
      q4Share: 0.25,
    },
    products: [],
    allocation: {
      departments,
      categories,
      matrix,
      costLines,
      deptCosts,
      deptByCategoryYear: {},
    },
    pl,
    bs: emptyStmt,
    cf: emptyStmt,
    ratios: emptyStmt,
    excelAuditChecks: [],
    sliderDefinitions: [],
    sliderControls: [],
    presets: [],
    overdraftSeries: Array.from({ length: periods }, () => 0),
    shareholderLoanSeries: Array.from({ length: periods }, () => 0),
  };
}

describe('Faza 3 — Analityka kosztów, Waterfall, Macierz i Insights Engine', () => {
  it('wylicza KPI, macierz cieplną, filtr działu, Waterfall (z zero-crossing i dynamicznym CIT) oraz wnioski dla BETA v2', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const base = session.baseDomain!;

      // 1. KPI Rok (-1) oraz Październik (9)
      const kpisYear = computeCostKpis(base, base, -1);
      expect(kpisYear.totalCost).toBeCloseTo(10_457_692.34, 1);
      expect(kpisYear.revenue).toBeCloseTo(9_000_000, 1);
      expect(kpisYear.netIncome).toBeCloseTo(-1_337_692.34, 1);
      expect(kpisYear.topDept?.code).toBe('PROD');
      expect(kpisYear.variableCost).toBeCloseTo(6_117_200, 1);
      expect(kpisYear.fixedCost).toBeCloseTo(4_340_492.34, 1);

      const kpisOct = computeCostKpis(base, base, 9);
      expect(kpisOct.totalCost).toBeCloseTo(1_208_095.12, 1);
      expect(kpisOct.revenue).toBeCloseTo(1_200_000, 1);
      expect(kpisOct.netIncome).toBeCloseTo(1_904.88, 1);
      expect(kpisOct.costMomDelta).toBeGreaterThan(280_000);

      // 2. Heatmap i cross-filtering kategorii
      const hmYear = computeHeatmapMatrix(base, -1);
      expect(hmYear.grandTotal).toBeCloseTo(10_457_692.34, 1);
      const prodYearRow = hmYear.rows.find((r) => r.deptCode === 'PROD')!;
      const finYearRow = hmYear.rows.find((r) => r.deptCode === 'FIN')!;
      expect(prodYearRow.values.MAT).toBeCloseTo(3_515_200, 1);
      expect(finYearRow.values.FIN).toBeCloseTo(119_492.34, 1);

      const hmOct = computeHeatmapMatrix(base, 9);
      expect(hmOct.grandTotal).toBeCloseTo(1_208_095.12, 1);
      expect(hmOct.rows.find((r) => r.deptCode === 'PROD')!.values.MAT).toBeCloseTo(
        499_200,
        1,
      );

      const catsAllOct = computeCategoryBreakdown(base, base, 9, null);
      expect(catsAllOct.some((c) => c.code === 'FIN')).toBe(true);

      const catsProdOct = computeCategoryBreakdown(base, base, 9, 'PROD');
      const prodOctSum = catsProdOct.reduce((acc, c) => acc + c.amount, 0);
      const prodOctFromDeptTable =
        base.allocation.deptCosts.find((d) => d.deptCode === 'PROD')?.months[9] ?? 0;
      expect(prodOctSum).toBeCloseTo(prodOctFromDeptTable, 2);
      expect(catsProdOct.some((c) => c.code === 'FIN')).toBe(false);

      // 3. Waterfall bazowy (pominięty PL_CIT = 0 + crossing zero + spójny koniec)
      const wfBase = computeWaterfallSteps(base, -1);
      expect(wfBase[0].lineCode).toBe('PL_REV_TOTAL');
      expect(wfBase[0].to).toBeCloseTo(9_000_000, 1);
      expect(wfBase.some((s) => s.lineCode === 'PL_CIT')).toBe(false);
      expect(wfBase.some((s) => s.from > 0 && s.to < 0)).toBe(true);
      const wfLastBase = wfBase[wfBase.length - 1];
      expect(wfLastBase.lineCode).toBe('PL_NET_INCOME');
      expect(wfLastBase.runningAfter).toBeCloseTo(base.pl.byCode.PL_NET_INCOME.yearValue!, 1);

      // 4. Waterfall w symulacji zysku (pojawia się dynamicznie PL_CIT < 0)
      const byKey = new Map(base.sliderControls.map((c) => [c.controlKey, c]));
      const simProfit = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: 0.25 },
        { coord: byKey.get('price')!.cell, value: 0.15 },
      ]);
      const wfProfit = computeWaterfallSteps(simProfit.domain, -1);
      const citStep = wfProfit.find((s) => s.lineCode === 'PL_CIT');
      expect(citStep).toBeDefined();
      expect(citStep!.signedDelta).toBeLessThan(0);
      expect(wfProfit[wfProfit.length - 1].runningAfter).toBeCloseTo(
        simProfit.domain.pl.byCode.PL_NET_INCOME.yearValue!,
        1,
      );

      // 5. Insights Engine — Rok bazowy, Październik m/m, oraz aktywna symulacja
      const insYear = generateCostInsights({
        activeDomain: base,
        baseDomain: base,
        activeAudit: session.baseAudit,
        periodIdx: -1,
        selectedDeptCode: null,
        isSimulationActive: false,
      });
      const insYearJoined = insYear.map((i) => insightText(i.segments)).join('\n');
      expect(insYearJoined).toContain('Produkcja');
      expect(insYearJoined).toContain('Logistyka i magazyn');
      expect(insYearJoined).toMatch(/13,1[78] mln/);
      expect(insYear.some((i) => i.id === 'simulation-impact')).toBe(false);

      const insOct = generateCostInsights({
        activeDomain: base,
        baseDomain: base,
        activeAudit: session.baseAudit,
        periodIdx: 9,
        selectedDeptCode: null,
        isSimulationActive: false,
      });
      const momText = insightText(insOct.find((i) => i.id === 'mom-dynamics')!.segments);
      expect(momText).toContain('Surowiec S');

      const insSim = generateCostInsights({
        activeDomain: simProfit.domain,
        baseDomain: base,
        activeAudit: simProfit.audit,
        periodIdx: -1,
        selectedDeptCode: 'PROD',
        isSimulationActive: true,
      });
      expect(insSim.some((i) => i.id === 'simulation-impact')).toBe(true);
      expect(
        insightText(insSim.find((i) => i.id === 'top-category')!.segments),
      ).toContain('Produkcja');
    } finally {
      session.destroy();
    }
  });

  it('działa elastycznie na modelu non-BETA o 8 działach × 10 kategoriach × 18 okresach', () => {
    const dom = makeNonBeta8x10x18Domain();

    const hm = computeHeatmapMatrix(dom, -1);
    expect(hm.rows).toHaveLength(8);
    expect(hm.categories).toHaveLength(10);
    expect(hm.grandTotal).toBeCloseTo(550_000 * 18, 1);

    const wf = computeWaterfallSteps(dom, -1);
    expect(wf).toHaveLength(6);
    expect(wf[wf.length - 1].runningAfter).toBeCloseTo(150_000 * 18, 1);

    const trend = computeMonthlyTrendSeries(dom, dom);
    expect(trend.periodHeaders).toHaveLength(18);
    expect(trend.deptSeries).toHaveLength(8);
    expect(trend.totalCostSeries[17]).toBeCloseTo(550_000, 1);

    const insights = generateCostInsights({
      activeDomain: dom,
      baseDomain: dom,
      activeAudit: null,
      periodIdx: 12,
      selectedDeptCode: null,
      isSimulationActive: false,
    });
    expect(insights.length).toBeGreaterThanOrEqual(4);
  });
});
