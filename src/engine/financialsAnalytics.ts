import type { ModelAuditReport } from '@/types/audit';
import type { FinancialDomainModel, StatementRow, StatementRowType, StatementTable } from '@/types/financial';

export type StatementKind = 'pl' | 'bs' | 'cf' | 'ratios';
export type DeltaTone = 'good' | 'bad' | 'neutral';
export type RatioHealth = 'good' | 'warn' | 'bad' | 'neutral';

export interface StatementDisplayRow {
  row: StatementRow;
  baseRow: StatementRow | null;
  activeRefValue: number | null;
  baseRefValue: number | null;
  deltaVsBase: number | null;
  deltaTone: DeltaTone;
  isCheckOk: boolean | null;
}

export interface FinancialOverviewKpis {
  revenue: number;
  baseRevenue: number;
  revenueDelta: number;
  ebitda: number;
  baseEbitda: number;
  ebitdaDelta: number;
  ebitdaMargin: number;
  baseEbitdaMargin: number;
  netIncome: number;
  baseNetIncome: number;
  netIncomeDelta: number;
  netMargin: number;
  cashEnd: number;
  baseCashEnd: number;
  cashDelta: number;
  minCashSeries: number;
  minCashThreshold: number;
  peakOverdraft: number;
  basePeakOverdraft: number;
  overdraftLimit: number;
  peakOverdraftUtilization: number;
  periodOverdraft: number;
  netDebtEnd: number;
  baseNetDebtEnd: number;
  netDebtDelta: number;
  peakShareholderLoan: number;
  maxBalanceDiff: number;
  maxCfVsBsDiff: number;
  zeroPointLocked: boolean;
}

export interface DebtLiquiditySeries {
  periodHeaders: string[];
  loanSeries: number[];
  overdraftSeries: number[];
  shareholderLoanSeries: number[];
  cashSeries: number[];
  baseOverdraftSeries: number[];
  totalDebtSeries: number[];
  overdraftLimit: number;
  minCash: number;
}

export interface ProfitabilityCashflowSeries {
  periodHeaders: string[];
  revenueSeries: number[];
  ebitdaSeries: number[];
  netIncomeSeries: number[];
  cfoSeries: number[];
}

export interface RatioHighlightCard {
  lineCode: string;
  label: string;
  shortLabel: string;
  rowType: StatementRowType;
  value: number;
  baseValue: number;
  delta: number;
  deltaTone: DeltaTone;
  health: RatioHealth;
  thresholdHint: string;
}

export function resolveStatementRefValue(
  row: StatementRow | null | undefined,
  hasYearColumn: boolean,
  selectedPeriod: number,
): number | null {
  if (!row || row.rowType === 'SECTION') return null;
  if (selectedPeriod >= 0) {
    return row.months[selectedPeriod] ?? null;
  }
  if (hasYearColumn) {
    return row.yearValue;
  }
  if (row.months.length === 0) return row.zeroValue;
  return row.months[row.months.length - 1] ?? null;
}

function getBsPointIdx(table: StatementTable, periodIdx: number): number {
  const len = Math.max(0, table.periodHeaders.length);
  if (periodIdx >= 0 && periodIdx < len) return periodIdx;
  return Math.max(0, len - 1);
}

function isPlExpenseRow(row: StatementRow): boolean {
  if (row.wfRole === 'DELTA_NEG') return true;
  return (
    row.lineCode.startsWith('PL_COGS_') ||
    row.lineCode.startsWith('PL_VAR_') ||
    row.lineCode.startsWith('PL_FIX_') ||
    row.lineCode.startsWith('PL_DEPR') ||
    row.lineCode.startsWith('PL_FIN_') ||
    row.lineCode.startsWith('PL_CIT')
  );
}

export function classifyDeltaTone(
  kind: StatementKind,
  row: StatementRow,
  delta: number | null,
): DeltaTone {
  if (
    delta === null ||
    Math.abs(delta) < 1e-6 ||
    row.rowType === 'SECTION' ||
    row.rowType === 'CHECK'
  ) {
    return 'neutral';
  }

  if (kind === 'pl') {
    if (isPlExpenseRow(row)) {
      return delta < 0 ? 'good' : 'bad';
    }
    return delta > 0 ? 'good' : 'bad';
  }

  if (kind === 'cf') {
    if (row.lineCode === 'CF_CASH_OPEN') return 'neutral';
    return delta > 0 ? 'good' : 'bad';
  }

  if (kind === 'bs') {
    if (row.lineCode === 'BS_CASH' || row.lineCode === 'BS_EQUITY') {
      return delta > 0 ? 'good' : 'bad';
    }
    if (
      row.lineCode === 'BS_OVERDRAFT' ||
      row.lineCode === 'BS_SH_LOAN' ||
      row.lineCode === 'BS_LOAN'
    ) {
      return delta < 0 ? 'good' : 'bad';
    }
    return 'neutral';
  }

  // ratios
  if (
    row.lineCode === 'RT_NET_DEBT' ||
    row.lineCode === 'RT_OV_UTIL' ||
    row.lineCode === 'RT_DSO' ||
    row.lineCode === 'RT_DIO'
  ) {
    return delta < 0 ? 'good' : 'bad';
  }
  return delta > 0 ? 'good' : 'bad';
}

export function buildStatementComparisonRows(
  activeTable: StatementTable,
  baseTable: StatementTable | null,
  kind: StatementKind,
  selectedPeriod: number,
): StatementDisplayRow[] {
  const baseByCode = baseTable?.byCode ?? {};
  return activeTable.rows.map((row) => {
    const baseRow = row.lineCode ? (baseByCode[row.lineCode] ?? null) : null;
    const activeRefValue = resolveStatementRefValue(row, activeTable.hasYearColumn, selectedPeriod);
    const baseRefValue = baseRow
      ? resolveStatementRefValue(baseRow, baseTable?.hasYearColumn ?? activeTable.hasYearColumn, selectedPeriod)
      : null;

    const deltaVsBase =
      activeRefValue !== null && baseRefValue !== null ? activeRefValue - baseRefValue : null;

    const deltaTone = classifyDeltaTone(kind, row, deltaVsBase);

    let isCheckOk: boolean | null = null;
    if (row.rowType === 'CHECK') {
      const checkVals: number[] = [...row.months];
      if (row.zeroValue !== null) checkVals.push(row.zeroValue);
      if (row.yearValue !== null) checkVals.push(row.yearValue);
      isCheckOk = checkVals.every((v) => Math.abs(v) <= 0.01);
    }

    return {
      row,
      baseRow,
      activeRefValue,
      baseRefValue,
      deltaVsBase,
      deltaTone,
      isCheckOk,
    };
  });
}

function getRowValAt(
  table: StatementTable | undefined,
  code: string,
  periodIdx: number,
  usePointLast = false,
): number {
  const row = table?.byCode[code];
  if (!row) return 0;
  if (usePointLast) {
    const idx = getBsPointIdx(table!, periodIdx);
    return row.months[idx] ?? 0;
  }
  return periodIdx < 0 ? (row.yearValue ?? 0) : (row.months[periodIdx] ?? 0);
}

function maxOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((m, v) => (v > m ? v : m), -Infinity);
}

function minOf(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((m, v) => (v < m ? v : m), Infinity);
}

export function computeFinancialOverviewKpis(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
  activeAudit: ModelAuditReport | null,
  periodIdx: number,
): FinancialOverviewKpis {
  const base = baseDomain ?? activeDomain;

  const revenue = getRowValAt(activeDomain.pl, 'PL_REV_TOTAL', periodIdx);
  const baseRevenue = getRowValAt(base.pl, 'PL_REV_TOTAL', periodIdx);
  const ebitda = getRowValAt(activeDomain.pl, 'PL_EBITDA', periodIdx);
  const baseEbitda = getRowValAt(base.pl, 'PL_EBITDA', periodIdx);
  const netIncome = getRowValAt(activeDomain.pl, 'PL_NET_INCOME', periodIdx);
  const baseNetIncome = getRowValAt(base.pl, 'PL_NET_INCOME', periodIdx);

  const ebitdaMargin = Math.abs(revenue) > 1e-6 ? ebitda / revenue : 0;
  const baseEbitdaMargin = Math.abs(baseRevenue) > 1e-6 ? baseEbitda / baseRevenue : 0;
  const netMargin = Math.abs(revenue) > 1e-6 ? netIncome / revenue : 0;

  const cashEnd = getRowValAt(activeDomain.bs, 'BS_CASH', periodIdx, true);
  const baseCashEnd = getRowValAt(base.bs, 'BS_CASH', periodIdx, true);
  const cashMonths = activeDomain.bs.byCode.BS_CASH?.months ?? [];
  const minCashSeries = cashMonths.length > 0 ? minOf(cashMonths) : cashEnd;

  const ovSeries =
    activeDomain.overdraftSeries.length > 0
      ? activeDomain.overdraftSeries
      : (activeDomain.bs.byCode.BS_OVERDRAFT?.months ?? []);
  const baseOvSeries =
    base.overdraftSeries.length > 0
      ? base.overdraftSeries
      : (base.bs.byCode.BS_OVERDRAFT?.months ?? []);

  const peakOverdraft = maxOf(ovSeries);
  const basePeakOverdraft = maxOf(baseOvSeries);
  const overdraftLimit = activeDomain.config.overdraftLimit;
  const peakOverdraftUtilization =
    overdraftLimit > 1e-6 ? peakOverdraft / overdraftLimit : 0;
  const periodOverdraft = getRowValAt(activeDomain.bs, 'BS_OVERDRAFT', periodIdx, true);

  const bsPointIdx = getBsPointIdx(activeDomain.bs, periodIdx);
  const fallbackNetDebt = (dom: FinancialDomainModel): number => {
    const loan = dom.bs.byCode.BS_LOAN?.months[bsPointIdx] ?? 0;
    const ov = dom.bs.byCode.BS_OVERDRAFT?.months[bsPointIdx] ?? 0;
    const sh = dom.bs.byCode.BS_SH_LOAN?.months[bsPointIdx] ?? 0;
    const cash = dom.bs.byCode.BS_CASH?.months[bsPointIdx] ?? 0;
    return loan + ov + sh - cash;
  };

  const netDebtEnd = activeDomain.ratios.byCode.RT_NET_DEBT
    ? getRowValAt(activeDomain.ratios, 'RT_NET_DEBT', periodIdx, true)
    : fallbackNetDebt(activeDomain);
  const baseNetDebtEnd = base.ratios.byCode.RT_NET_DEBT
    ? getRowValAt(base.ratios, 'RT_NET_DEBT', periodIdx, true)
    : fallbackNetDebt(base);

  const shSeries =
    activeDomain.shareholderLoanSeries.length > 0
      ? activeDomain.shareholderLoanSeries
      : (activeDomain.bs.byCode.BS_SH_LOAN?.months ?? []);
  const peakShareholderLoan = maxOf(shSeries);

  return {
    revenue,
    baseRevenue,
    revenueDelta: revenue - baseRevenue,
    ebitda,
    baseEbitda,
    ebitdaDelta: ebitda - baseEbitda,
    ebitdaMargin,
    baseEbitdaMargin,
    netIncome,
    baseNetIncome,
    netIncomeDelta: netIncome - baseNetIncome,
    netMargin,
    cashEnd,
    baseCashEnd,
    cashDelta: cashEnd - baseCashEnd,
    minCashSeries,
    minCashThreshold: activeDomain.config.minCash,
    peakOverdraft,
    basePeakOverdraft,
    overdraftLimit,
    peakOverdraftUtilization,
    periodOverdraft,
    netDebtEnd,
    baseNetDebtEnd,
    netDebtDelta: netDebtEnd - baseNetDebtEnd,
    peakShareholderLoan,
    maxBalanceDiff: activeAudit?.integrity.maxBalanceDiff ?? 0,
    maxCfVsBsDiff: activeAudit?.integrity.maxCfVsBsDiff ?? 0,
    zeroPointLocked: activeAudit?.integrity.zeroPointLocked ?? true,
  };
}

export function computeDebtLiquiditySeries(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
): DebtLiquiditySeries {
  const base = baseDomain ?? activeDomain;
  const periodHeaders = activeDomain.metadata.periodHeaders;
  const n = periodHeaders.length;

  const pad = (arr: number[] | undefined): number[] =>
    Array.from({ length: n }, (_, i) => arr?.[i] ?? 0);

  const loanSeries = pad(activeDomain.bs.byCode.BS_LOAN?.months);
  const overdraftSeries = pad(
    activeDomain.overdraftSeries.length > 0
      ? activeDomain.overdraftSeries
      : activeDomain.bs.byCode.BS_OVERDRAFT?.months,
  );
  const shareholderLoanSeries = pad(
    activeDomain.shareholderLoanSeries.length > 0
      ? activeDomain.shareholderLoanSeries
      : activeDomain.bs.byCode.BS_SH_LOAN?.months,
  );
  const cashSeries = pad(activeDomain.bs.byCode.BS_CASH?.months);
  const baseOverdraftSeries = pad(
    base.overdraftSeries.length > 0
      ? base.overdraftSeries
      : base.bs.byCode.BS_OVERDRAFT?.months,
  );
  const totalDebtSeries = Array.from(
    { length: n },
    (_, i) => loanSeries[i] + overdraftSeries[i] + shareholderLoanSeries[i],
  );

  return {
    periodHeaders,
    loanSeries,
    overdraftSeries,
    shareholderLoanSeries,
    cashSeries,
    baseOverdraftSeries,
    totalDebtSeries,
    overdraftLimit: activeDomain.config.overdraftLimit,
    minCash: activeDomain.config.minCash,
  };
}

export function computeProfitabilityCashflowSeries(
  activeDomain: FinancialDomainModel,
): ProfitabilityCashflowSeries {
  const periodHeaders = activeDomain.metadata.periodHeaders;
  const n = periodHeaders.length;
  const pad = (arr: number[] | undefined): number[] =>
    Array.from({ length: n }, (_, i) => arr?.[i] ?? 0);

  return {
    periodHeaders,
    revenueSeries: pad(activeDomain.pl.byCode.PL_REV_TOTAL?.months),
    ebitdaSeries: pad(activeDomain.pl.byCode.PL_EBITDA?.months),
    netIncomeSeries: pad(activeDomain.pl.byCode.PL_NET_INCOME?.months),
    cfoSeries: pad(activeDomain.cf.byCode.CF_CFO?.months),
  };
}

interface HighlightConfig {
  lineCode: string;
  shortLabel: string;
  thresholdHint: string;
  evaluate: (val: number) => RatioHealth;
}

const HIGHLIGHT_CONFIGS: HighlightConfig[] = [
  {
    lineCode: 'RT_CURRENT_RATIO',
    shortLabel: 'Płynność bieżąca',
    thresholdHint: 'Bezpiecznie ≥ 1,20x',
    evaluate: (v) => (v >= 1.2 ? 'good' : v >= 1.0 ? 'warn' : 'bad'),
  },
  {
    lineCode: 'RT_QUICK_RATIO',
    shortLabel: 'Płynność szybka',
    thresholdHint: 'Docelowo ≥ 0,85x',
    evaluate: (v) => (v >= 0.85 ? 'good' : v >= 0.65 ? 'warn' : 'bad'),
  },
  {
    lineCode: 'RT_DSO',
    shortLabel: 'DSO (Należności)',
    thresholdHint: 'Rotacja spływu należności',
    evaluate: (v) => (v <= 45 ? 'good' : v <= 65 ? 'warn' : 'bad'),
  },
  {
    lineCode: 'RT_DIO',
    shortLabel: 'DIO (Zapasy)',
    thresholdHint: 'Rotacja zapasów surowca',
    evaluate: (v) => (v <= 45 ? 'good' : v <= 70 ? 'warn' : 'bad'),
  },
  {
    lineCode: 'RT_NET_DEBT',
    shortLabel: 'Dług netto',
    thresholdHint: 'Dług brutto minus gotówka',
    evaluate: (v) => (v <= 0 ? 'good' : 'neutral'),
  },
  {
    lineCode: 'RT_OV_UTIL',
    shortLabel: 'Wykorzystanie overdraftu',
    thresholdHint: 'Ostrzeżenie > 80% limitu',
    evaluate: (v) => (v <= 0.65 ? 'good' : v <= 0.85 ? 'warn' : 'bad'),
  },
];

export function computeRatioHighlights(
  activeDomain: FinancialDomainModel,
  baseDomain: FinancialDomainModel | null,
  periodIdx: number,
): RatioHighlightCard[] {
  const base = baseDomain ?? activeDomain;
  const out: RatioHighlightCard[] = [];

  for (const cfg of HIGHLIGHT_CONFIGS) {
    const row = activeDomain.ratios.byCode[cfg.lineCode];
    if (!row) continue;
    const baseRow = base.ratios.byCode[cfg.lineCode] ?? row;
    const val = resolveStatementRefValue(row, activeDomain.ratios.hasYearColumn, periodIdx) ?? 0;
    const baseVal = resolveStatementRefValue(baseRow, base.ratios.hasYearColumn, periodIdx) ?? val;
    const delta = val - baseVal;

    out.push({
      lineCode: cfg.lineCode,
      label: row.label,
      shortLabel: cfg.shortLabel,
      rowType: row.rowType,
      value: val,
      baseValue: baseVal,
      delta,
      deltaTone: classifyDeltaTone('ratios', row, delta),
      health: cfg.evaluate(val),
      thresholdHint: cfg.thresholdHint,
    });
  }

  return out;
}
