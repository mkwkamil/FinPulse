import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildStatementComparisonRows,
  computeDebtLiquiditySeries,
  computeFinancialOverviewKpis,
  computeProfitabilityCashflowSeries,
  computeRatioHighlights,
} from '@/engine/financialsAnalytics';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import type { FinancialDomainModel, StatementRow, StatementTable } from '@/types/financial';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

function make18MStatementsDomain(): FinancialDomainModel {
  const periods = 18;
  const periodHeaders = Array.from({ length: periods }, (_, idx) => {
    const y = 2027 + Math.floor(idx / 12);
    const m = String((idx % 12) + 1).padStart(2, '0');
    return `${y}-${m}`;
  });

  const makeRow = (
    lineCode: string,
    rowType: StatementRow['rowType'],
    label: string,
    months: number[],
    zeroValue: number | null = null,
    yearValue: number | null = null,
  ): StatementRow => ({
    lineCode,
    rowType,
    aggMode: 'LAST',
    wfRole: 'NONE',
    label,
    zeroValue,
    months,
    yearValue,
  });

  const bsRows = [
    makeRow(
      'BS_LOAN',
      'DETAIL',
      'Kredyt',
      Array.from({ length: periods }, (_, i) => Math.max(0, 500_000 - i * 20_000)),
      520_000,
    ),
    makeRow(
      'BS_OVERDRAFT',
      'DETAIL',
      'Overdraft',
      Array.from({ length: periods }, (_, i) => 100_000 + i * 10_000),
      50_000,
    ),
    makeRow(
      'BS_SH_LOAN',
      'DETAIL',
      'Pożyczka wspólników',
      Array.from({ length: periods }, () => 0),
      0,
    ),
    makeRow(
      'BS_CASH',
      'DETAIL',
      'Gotówka',
      Array.from({ length: periods }, () => 150_000),
      150_000,
    ),
    makeRow(
      'BS_CHECK_BALANCE',
      'CHECK',
      'Kontrola',
      Array.from({ length: periods }, () => 0),
      0,
    ),
  ];

  const bs: StatementTable = {
    hasZeroColumn: true,
    hasYearColumn: false,
    periodHeaders,
    rows: bsRows,
    byCode: Object.fromEntries(bsRows.map((r) => [r.lineCode, r])),
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
      budgetTitle: 'Test 18M',
      currency: 'EUR',
      unitScale: 1000,
      zeroDate: '2026-12-31',
      defaultPeriod: 0,
      periodHeaders,
    },
    config: {
      citRate: 0.19,
      overdraftLimit: 800_000,
      minCash: 100_000,
      headcountTotal: 20,
      daysInMonth: 30,
      rawUsageFactor: 1,
      onlineShare: 0.2,
      q4Share: 0.25,
    },
    products: [],
    allocation: {
      departments: [],
      categories: [],
      matrix: [],
      costLines: [],
      deptCosts: [],
      deptByCategoryYear: {},
    },
    pl: emptyStmt,
    bs,
    cf: emptyStmt,
    ratios: emptyStmt,
    excelAuditChecks: [],
    sliderDefinitions: [],
    sliderControls: [],
    presets: [],
    overdraftSeries: bsRows[1].months,
    shareholderLoanSeries: bsRows[2].months,
  };
}

describe('Faza 4 — Analityka 3 sprawozdań, Wskaźniki i Płynność', () => {
  it('wylicza KPI Przeglądu, serie zadłużenia/CFO, porównanie wierszy z Momentem Zero i Wskaźniki na BETA v2', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const base = session.baseDomain!;
      const byKey = new Map(base.sliderControls.map((c) => [c.controlKey, c]));

      // 1. KPI Baza (Rok -1 oraz Październik 9)
      const kpisYear = computeFinancialOverviewKpis(base, base, session.baseAudit, -1);
      expect(kpisYear.revenue).toBeCloseTo(9_000_000, 1);
      expect(kpisYear.ebitda).toBeCloseTo(-618_200, 1);
      expect(kpisYear.netIncome).toBeCloseTo(-1_337_692.34, 1);
      expect(kpisYear.cashEnd).toBeCloseTo(200_000, 1);
      expect(kpisYear.peakOverdraft).toBeCloseTo(1_667_147.18, 1);
      expect(kpisYear.overdraftLimit).toBe(3_000_000);
      expect(kpisYear.peakShareholderLoan).toBeCloseTo(0, 2);

      const kpisOct = computeFinancialOverviewKpis(base, base, session.baseAudit, 9);
      expect(kpisOct.revenue).toBeCloseTo(1_200_000, 1);
      expect(kpisOct.netIncome).toBeCloseTo(1_904.88, 1);
      expect(kpisOct.cashEnd).toBeCloseTo(200_000, 1);
      expect(kpisOct.periodOverdraft).toBeGreaterThan(1_000_000);

      // 2. Scenariusz stresowy (uruchomiona pożyczka wspólników) i optymistyczny (wzrost zysku)
      const stress = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: -0.3 },
        { coord: byKey.get('price')!.cell, value: -0.2 },
        { coord: byKey.get('raw')!.cell, value: 0.3 },
      ]);
      const kpisStress = computeFinancialOverviewKpis(
        stress.domain,
        base,
        stress.audit,
        -1,
      );
      expect(kpisStress.peakShareholderLoan).toBeGreaterThan(0);
      expect(kpisStress.peakOverdraft).toBeLessThanOrEqual(3_000_000.01);
      expect(kpisStress.maxBalanceDiff).toBeLessThan(0.01);
      expect(kpisStress.maxCfVsBsDiff).toBeLessThan(0.01);
      expect(kpisStress.zeroPointLocked).toBe(true);

      const opt = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: 0.25 },
        { coord: byKey.get('price')!.cell, value: 0.15 },
      ]);

      // 3. Serie wykresów
      const debtSeries = computeDebtLiquiditySeries(stress.domain, base);
      expect(debtSeries.periodHeaders).toHaveLength(12);
      expect(debtSeries.overdraftSeries[11]).toBeCloseTo(
        stress.domain.bs.byCode.BS_OVERDRAFT.months[11],
        2,
      );
      expect(debtSeries.cashSeries[11]).toBeCloseTo(
        stress.domain.bs.byCode.BS_CASH.months[11],
        2,
      );

      const profSeries = computeProfitabilityCashflowSeries(opt.domain);
      expect(profSeries.periodHeaders).toHaveLength(12);
      expect(profSeries.cfoSeries[0]).toBeCloseTo(
        opt.domain.cf.byCode.CF_CFO.months[0],
        2,
      );

      // 4. buildStatementComparisonRows dla PL, BS, CF i deltaTone
      const plOptRows = buildStatementComparisonRows(
        opt.domain.pl,
        base.pl,
        'pl',
        -1,
      );
      const plNetRow = plOptRows.find((r) => r.row.lineCode === 'PL_NET_INCOME')!;
      expect(plNetRow.deltaVsBase).toBeGreaterThan(0);
      expect(plNetRow.deltaTone).toBe('good');

      const plRawStress = buildStatementComparisonRows(
        stress.domain.pl,
        base.pl,
        'pl',
        -1,
      ).find((r) => r.row.lineCode === 'PL_COGS_RAW')!;
      // W stresie wolumen spada o -30%, koszt surowca spada pomimo +30% ceny -> niższy koszt = 'good'
      expect(plRawStress.deltaTone).toBe(
        (plRawStress.deltaVsBase ?? 0) < 0 ? 'good' : 'bad',
      );

      const plRevStress = buildStatementComparisonRows(
        stress.domain.pl,
        base.pl,
        'pl',
        -1,
      ).find((r) => r.row.lineCode === 'PL_REV_TOTAL')!;
      expect(plRevStress.deltaVsBase).toBeLessThan(0);
      expect(plRevStress.deltaTone).toBe('bad');

      const bsStressRows = buildStatementComparisonRows(
        stress.domain.bs,
        base.bs,
        'bs',
        -1,
      );
      const bsAssetsRow = bsStressRows.find((r) => r.row.lineCode === 'BS_ASSETS_TOTAL')!;
      expect(bsAssetsRow.row.zeroValue).toBe(base.bs.byCode.BS_ASSETS_TOTAL.zeroValue);
      expect(bsAssetsRow.activeRefValue).toBeCloseTo(
        stress.domain.bs.byCode.BS_ASSETS_TOTAL.months[11],
        2,
      );
      const bsOvRow = bsStressRows.find((r) => r.row.lineCode === 'BS_OVERDRAFT')!;
      if ((bsOvRow.deltaVsBase ?? 0) > 1) {
        expect(bsOvRow.deltaTone).toBe('bad');
      }
      const bsCheckRow = bsStressRows.find((r) => r.row.lineCode === 'BS_CHECK_BALANCE')!;
      expect(bsCheckRow.isCheckOk).toBe(true);

      const cfStressRows = buildStatementComparisonRows(
        stress.domain.cf,
        base.cf,
        'cf',
        -1,
      );
      const cfCheckRow = cfStressRows.find((r) => r.row.lineCode === 'CF_CHECK_VS_BS')!;
      expect(cfCheckRow.isCheckOk).toBe(true);

      // 5. Karty wskaźników
      const ratioCards = computeRatioHighlights(base, base, -1);
      expect(ratioCards).toHaveLength(6);
      const curRatio = ratioCards.find((c) => c.lineCode === 'RT_CURRENT_RATIO')!;
      expect(curRatio.value).toBeGreaterThan(0);
      const ovUtil = ratioCards.find((c) => c.lineCode === 'RT_OV_UTIL')!;
      expect(ovUtil.value).toBeGreaterThan(0);
    } finally {
      session.destroy();
    }
  });

  it('działa elastycznie na syntetycznym modelu 18-miesięcznym non-BETA', () => {
    const dom = make18MStatementsDomain();
    const debt = computeDebtLiquiditySeries(dom, dom);
    expect(debt.periodHeaders).toHaveLength(18);
    expect(debt.totalDebtSeries[17]).toBeCloseTo(
      dom.bs.byCode.BS_LOAN.months[17] + dom.bs.byCode.BS_OVERDRAFT.months[17],
      2,
    );

    const bsRows = buildStatementComparisonRows(dom.bs, dom.bs, 'bs', -1);
    expect(bsRows.find((r) => r.row.lineCode === 'BS_CHECK_BALANCE')?.isCheckOk).toBe(true);
    expect(bsRows.find((r) => r.row.lineCode === 'BS_LOAN')?.activeRefValue).toBeCloseTo(
      dom.bs.byCode.BS_LOAN.months[17],
      2,
    );
  });
});
