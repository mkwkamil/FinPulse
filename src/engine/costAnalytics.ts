import type {
  AllocationDomain,
  CategoryDef,
  CostLineMonthly,
  DeptCostMonthly,
  FinancialDomainModel,
  StatementTable,
} from '@/types/financial';

export interface CostKpiSummary {
  totalCost: number;
  baseTotalCost: number;
  costVsBase: number;
  costMomDelta: number | null;
  costMomPct: number | null;
  avgMonthlyCost: number;
  revenue: number;
  baseRevenue: number;
  costToRevRatio: number;
  baseCostToRevRatio: number;
  costToRevPpDelta: number;
  netIncome: number;
  baseNetIncome: number;
  netVsBase: number;
  netMargin: number;
  isProfit: boolean;
  topDept: {
    code: string;
    name: string;
    colorHex: string;
    amount: number;
    share: number;
  } | null;
  variableCost: number;
  fixedCost: number;
  variableShare: number;
  fixedShare: number;
}

export interface DeptBreakdownItem {
  code: string;
  name: string;
  colorHex: string;
  amount: number;
  baseAmount: number;
  deltaVsBase: number;
  share: number;
  momDelta: number | null;
  momPct: number | null;
}

export interface CategoryBreakdownItem {
  code: string;
  name: string;
  shortName: string;
  amount: number;
  baseAmount: number;
  deltaVsBase: number;
  share: number;
}

export interface HeatmapRow {
  deptCode: string;
  deptName: string;
  colorHex: string;
  values: Record<string, number>;
  rowTotal: number;
  share: number;
}

export interface HeatmapMatrixData {
  categories: CategoryDef[];
  rows: HeatmapRow[];
  colTotals: Record<string, number>;
  grandTotal: number;
  maxCellValue: number;
}

export type WaterfallStepKind = 'start' | 'pos' | 'neg' | 'subtotal' | 'end';

export interface WaterfallStep {
  lineCode: string;
  label: string;
  shortLabel: string;
  wfRole: string;
  kind: WaterfallStepKind;
  from: number;
  to: number;
  yLow: number;
  yHigh: number;
  signedDelta: number;
  runningAfter: number;
}

export interface MonthlyTrendDeptSeries {
  deptCode: string;
  deptName: string;
  colorHex: string;
  values: number[];
}

export interface MonthlyTrendData {
  periodHeaders: string[];
  deptSeries: MonthlyTrendDeptSeries[];
  revenueSeries: number[];
  totalCostSeries: number[];
  baseTotalCostSeries: number[];
  netIncomeSeries: number[];
}

export function getStatementValue(
  table: StatementTable | null | undefined,
  lineCode: string,
  periodIdx: number,
): number {
  const row = table?.byCode[lineCode];
  if (!row) return 0;
  return periodIdx < 0 ? (row.yearValue ?? 0) : (row.months[periodIdx] ?? 0);
}

export function getCostLineValue(line: CostLineMonthly, periodIdx: number): number {
  return periodIdx < 0 ? line.yearTotal : (line.months[periodIdx] ?? 0);
}

export function getDeptCostValue(deptCost: DeptCostMonthly, periodIdx: number): number {
  return periodIdx < 0 ? deptCost.yearTotal : (deptCost.months[periodIdx] ?? 0);
}

function sumDeptCosts(alloc: AllocationDomain, periodIdx: number): number {
  return alloc.deptCosts.reduce((acc, dc) => acc + getDeptCostValue(dc, periodIdx), 0);
}

function buildDeptMetaMap(alloc: AllocationDomain) {
  return new Map(alloc.departments.map((d) => [d.code, d]));
}

function buildMatrixMap(alloc: AllocationDomain) {
  return new Map(alloc.matrix.map((m) => [m.lineCode, m]));
}

function shortenWaterfallLabel(label: string): string {
  const map: Array<[RegExp, string]> = [
    [/^Przychody ze sprzedaży$/i, 'Przychody'],
    [/^Koszt surowca S$/i, 'Surowiec S'],
    [/^Koszt przetworzenia/i, 'Przetworzenie'],
    [/^Logistyka/i, 'Logistyka'],
    [/^Marketing performance$/i, 'Marketing'],
    [/^Podwykonawcy$/i, 'Podwykonawcy'],
    [/^Marża po kosztach zmiennych$/i, 'Marża zm.'],
    [/^Wynagrodzenia brutto$/i, 'Płace brutto'],
    [/^Składki ZUS/i, 'ZUS prac.'],
    [/^Najem$/i, 'Najem'],
    [/^Koszty sprzedaży stałe$/i, 'Sprzedaż st.'],
    [/^Pozostałe koszty stałe$/i, 'Pozost. stałe'],
    [/^Rozliczenie dotacji/i, 'Dotacja UE'],
    [/^Amortyzacja$/i, 'Amortyzacja'],
    [/^Koszty finansowe/i, 'Finansowe'],
    [/^Podatek dochodowy/i, 'CIT'],
    [/^Wynik netto$/i, 'Wynik netto'],
  ];
  for (const [re, short] of map) {
    if (re.test(label.trim())) return short;
  }
  return label.length > 15 ? `${label.slice(0, 14).trim()}…` : label;
}

export function computeCostKpis(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
  periodIdx: number,
): CostKpiSummary {
  const base = baseDomain ?? activeDomain;
  const periodCount = Math.max(1, activeDomain.metadata.periodHeaders.length);

  const totalCost = sumDeptCosts(activeDomain.allocation, periodIdx);
  const baseTotalCost = sumDeptCosts(base.allocation, periodIdx);
  const costVsBase = totalCost - baseTotalCost;

  let costMomDelta: number | null = null;
  let costMomPct: number | null = null;
  if (periodIdx > 0) {
    const prevTotal = sumDeptCosts(activeDomain.allocation, periodIdx - 1);
    costMomDelta = totalCost - prevTotal;
    costMomPct = Math.abs(prevTotal) > 1e-6 ? costMomDelta / prevTotal : null;
  }

  const yearTotalCost = sumDeptCosts(activeDomain.allocation, -1);
  const avgMonthlyCost = yearTotalCost / periodCount;

  const revenue = getStatementValue(activeDomain.pl, 'PL_REV_TOTAL', periodIdx);
  const baseRevenue = getStatementValue(base.pl, 'PL_REV_TOTAL', periodIdx);
  const costToRevRatio = Math.abs(revenue) > 1e-6 ? totalCost / revenue : 0;
  const baseCostToRevRatio = Math.abs(baseRevenue) > 1e-6 ? baseTotalCost / baseRevenue : 0;
  const costToRevPpDelta = costToRevRatio - baseCostToRevRatio;

  const netIncome = getStatementValue(activeDomain.pl, 'PL_NET_INCOME', periodIdx);
  const baseNetIncome = getStatementValue(base.pl, 'PL_NET_INCOME', periodIdx);
  const netVsBase = netIncome - baseNetIncome;
  const netMargin = Math.abs(revenue) > 1e-6 ? netIncome / revenue : 0;

  const depts = computeDeptBreakdown(activeDomain, base, periodIdx);
  const top = depts[0] ?? null;

  let variableCost = 0;
  let fixedCost = 0;
  for (const line of activeDomain.allocation.costLines) {
    const val = getCostLineValue(line, periodIdx);
    if (line.costBehavior === 'VARIABLE') {
      variableCost += val;
    } else {
      fixedCost += val;
    }
  }
  const vfTotal = variableCost + fixedCost;
  const variableShare = Math.abs(vfTotal) > 1e-6 ? variableCost / vfTotal : 0;
  const fixedShare = Math.abs(vfTotal) > 1e-6 ? fixedCost / vfTotal : 0;

  return {
    totalCost,
    baseTotalCost,
    costVsBase,
    costMomDelta,
    costMomPct,
    avgMonthlyCost,
    revenue,
    baseRevenue,
    costToRevRatio,
    baseCostToRevRatio,
    costToRevPpDelta,
    netIncome,
    baseNetIncome,
    netVsBase,
    netMargin,
    isProfit: netIncome >= 0,
    topDept: top
      ? {
          code: top.code,
          name: top.name,
          colorHex: top.colorHex,
          amount: top.amount,
          share: top.share,
        }
      : null,
    variableCost,
    fixedCost,
    variableShare,
    fixedShare,
  };
}

export function computeDeptBreakdown(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
  periodIdx: number,
): DeptBreakdownItem[] {
  const base = baseDomain ?? activeDomain;
  const metaMap = buildDeptMetaMap(activeDomain.allocation);
  const baseByCode = new Map(base.allocation.deptCosts.map((d) => [d.deptCode, d]));
  const total = sumDeptCosts(activeDomain.allocation, periodIdx);

  const items: DeptBreakdownItem[] = activeDomain.allocation.deptCosts.map((dc) => {
    const amount = getDeptCostValue(dc, periodIdx);
    const baseRow = baseByCode.get(dc.deptCode);
    const baseAmount = baseRow ? getDeptCostValue(baseRow, periodIdx) : amount;
    let momDelta: number | null = null;
    let momPct: number | null = null;
    if (periodIdx > 0) {
      const prevAmt = getDeptCostValue(dc, periodIdx - 1);
      momDelta = amount - prevAmt;
      momPct = Math.abs(prevAmt) > 1e-6 ? momDelta / prevAmt : null;
    }
    const meta = metaMap.get(dc.deptCode);
    return {
      code: dc.deptCode,
      name: dc.deptName,
      colorHex: meta?.colorHex ?? '#3987e5',
      amount,
      baseAmount,
      deltaVsBase: amount - baseAmount,
      share: Math.abs(total) > 1e-6 ? amount / total : 0,
      momDelta,
      momPct,
    };
  });

  items.sort((a, b) => b.amount - a.amount);
  return items;
}

function sumCategoriesForDomain(
  alloc: AllocationDomain,
  periodIdx: number,
  deptCodeFilter: string | null,
): Map<string, number> {
  const sums = new Map<string, number>();
  const matrixMap = buildMatrixMap(alloc);

  for (const line of alloc.costLines) {
    const lineVal = getCostLineValue(line, periodIdx);
    let weighted = lineVal;
    if (deptCodeFilter !== null) {
      const mRow = matrixMap.get(line.lineCode);
      const weight = mRow?.weights[deptCodeFilter] ?? 0;
      weighted = lineVal * weight;
    }
    sums.set(line.catCode, (sums.get(line.catCode) ?? 0) + weighted);
  }
  return sums;
}

export function computeCategoryBreakdown(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
  periodIdx: number,
  deptCodeFilter: string | null,
): CategoryBreakdownItem[] {
  const base = baseDomain ?? activeDomain;
  const activeSums = sumCategoriesForDomain(activeDomain.allocation, periodIdx, deptCodeFilter);
  const baseSums = sumCategoriesForDomain(base.allocation, periodIdx, deptCodeFilter);

  const items: CategoryBreakdownItem[] = [];
  let grand = 0;
  for (const val of activeSums.values()) grand += val;

  for (const cat of activeDomain.allocation.categories) {
    const amount = activeSums.get(cat.code) ?? 0;
    const baseAmount = baseSums.get(cat.code) ?? 0;
    if (Math.abs(amount) < 0.5 && Math.abs(baseAmount) < 0.5) continue;
    items.push({
      code: cat.code,
      name: cat.name,
      shortName: cat.shortName,
      amount,
      baseAmount,
      deltaVsBase: amount - baseAmount,
      share: 0,
    });
  }

  for (const item of items) {
    item.share = Math.abs(grand) > 1e-6 ? item.amount / grand : 0;
  }

  items.sort((a, b) => b.amount - a.amount);
  return items;
}

export function computeHeatmapMatrix(
  activeDomain: FinancialDomainModel,
  periodIdx: number,
): HeatmapMatrixData {
  const { departments, categories, costLines, matrix } = activeDomain.allocation;
  const matrixMap = new Map(matrix.map((m) => [m.lineCode, m]));

  const deptCatGrid: Record<string, Record<string, number>> = {};
  for (const dept of departments) {
    deptCatGrid[dept.code] = {};
    for (const cat of categories) {
      deptCatGrid[dept.code][cat.code] = 0;
    }
  }

  for (const line of costLines) {
    const lineVal = getCostLineValue(line, periodIdx);
    if (Math.abs(lineVal) < 1e-9) continue;
    const mRow = matrixMap.get(line.lineCode);
    if (!mRow) continue;
    for (const dept of departments) {
      const w = mRow.weights[dept.code] ?? 0;
      if (Math.abs(w) < 1e-9) continue;
      deptCatGrid[dept.code][line.catCode] =
        (deptCatGrid[dept.code][line.catCode] ?? 0) + lineVal * w;
    }
  }

  const colTotalsAll: Record<string, number> = {};
  for (const cat of categories) {
    let colSum = 0;
    for (const dept of departments) {
      colSum += deptCatGrid[dept.code][cat.code] ?? 0;
    }
    colTotalsAll[cat.code] = colSum;
  }

  const activeCategories = categories
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((cat) => Math.abs(colTotalsAll[cat.code] ?? 0) >= 0.5);

  const colTotals: Record<string, number> = {};
  for (const cat of activeCategories) {
    colTotals[cat.code] = colTotalsAll[cat.code] ?? 0;
  }

  let grandTotal = 0;
  let maxCellValue = 0;
  const rawRows: Array<Omit<HeatmapRow, 'share'>> = departments.map((dept) => {
    const values: Record<string, number> = {};
    let rowTotal = 0;
    for (const cat of activeCategories) {
      const val = deptCatGrid[dept.code][cat.code] ?? 0;
      values[cat.code] = val;
      rowTotal += val;
      if (val > maxCellValue) maxCellValue = val;
    }
    grandTotal += rowTotal;
    return {
      deptCode: dept.code,
      deptName: dept.name,
      colorHex: dept.colorHex,
      values,
      rowTotal,
    };
  });

  const rows: HeatmapRow[] = rawRows
    .map((r) => ({
      ...r,
      share: Math.abs(grandTotal) > 1e-6 ? r.rowTotal / grandTotal : 0,
    }))
    .sort((a, b) => b.rowTotal - a.rowTotal);

  return {
    categories: activeCategories,
    rows,
    colTotals,
    grandTotal,
    maxCellValue,
  };
}

export function computeWaterfallSteps(
  activeDomain: FinancialDomainModel,
  periodIdx: number,
): WaterfallStep[] {
  const steps: WaterfallStep[] = [];
  let running = 0;

  for (const row of activeDomain.pl.rows) {
    if (row.wfRole === 'NONE') continue;
    const val = periodIdx < 0 ? (row.yearValue ?? 0) : (row.months[periodIdx] ?? 0);

    if (row.wfRole === 'START') {
      running = val;
      steps.push({
        lineCode: row.lineCode,
        label: row.label,
        shortLabel: shortenWaterfallLabel(row.label),
        wfRole: row.wfRole,
        kind: 'start',
        from: 0,
        to: val,
        yLow: Math.min(0, val),
        yHigh: Math.max(0, val),
        signedDelta: val,
        runningAfter: running,
      });
      continue;
    }

    if (row.wfRole === 'DELTA_NEG' || row.wfRole === 'DELTA_POS') {
      const signedDelta = row.wfRole === 'DELTA_NEG' ? -val : val;
      if (Math.abs(signedDelta) < 0.5) continue;
      const from = running;
      const to = running + signedDelta;
      running = to;
      steps.push({
        lineCode: row.lineCode,
        label: row.label,
        shortLabel: shortenWaterfallLabel(row.label),
        wfRole: row.wfRole,
        kind: signedDelta >= 0 ? 'pos' : 'neg',
        from,
        to,
        yLow: Math.min(from, to),
        yHigh: Math.max(from, to),
        signedDelta,
        runningAfter: running,
      });
      continue;
    }

    if (row.wfRole === 'SUBTOTAL' || row.wfRole === 'END') {
      running = val;
      steps.push({
        lineCode: row.lineCode,
        label: row.label,
        shortLabel: shortenWaterfallLabel(row.label),
        wfRole: row.wfRole,
        kind: row.wfRole === 'END' ? 'end' : 'subtotal',
        from: 0,
        to: val,
        yLow: Math.min(0, val),
        yHigh: Math.max(0, val),
        signedDelta: val,
        runningAfter: running,
      });
    }
  }

  return steps;
}

export function computeMonthlyTrendSeries(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
): MonthlyTrendData {
  const base = baseDomain ?? activeDomain;
  const periodHeaders = activeDomain.metadata.periodHeaders;
  const periodCount = periodHeaders.length;
  const deptCostMap = new Map(
    activeDomain.allocation.deptCosts.map((dc) => [dc.deptCode, dc]),
  );

  const deptSeries: MonthlyTrendDeptSeries[] = activeDomain.allocation.departments.map(
    (dept) => {
      const dc = deptCostMap.get(dept.code);
      return {
        deptCode: dept.code,
        deptName: dept.name,
        colorHex: dept.colorHex,
        values: Array.from({ length: periodCount }, (_, idx) => dc?.months[idx] ?? 0),
      };
    },
  );

  const revenueRow = activeDomain.pl.byCode.PL_REV_TOTAL;
  const netRow = activeDomain.pl.byCode.PL_NET_INCOME;

  const revenueSeries = Array.from(
    { length: periodCount },
    (_, idx) => revenueRow?.months[idx] ?? 0,
  );
  const netIncomeSeries = Array.from(
    { length: periodCount },
    (_, idx) => netRow?.months[idx] ?? 0,
  );

  const totalCostSeries = Array.from({ length: periodCount }, (_, idx) =>
    sumDeptCosts(activeDomain.allocation, idx),
  );
  const baseTotalCostSeries = Array.from({ length: periodCount }, (_, idx) =>
    sumDeptCosts(base.allocation, idx),
  );

  return {
    periodHeaders,
    deptSeries,
    revenueSeries,
    totalCostSeries,
    baseTotalCostSeries,
    netIncomeSeries,
  };
}
