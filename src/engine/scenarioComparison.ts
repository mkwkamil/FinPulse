import type { ResolvedSliderControl } from '@/types/contract';
import type { FinancialDomainModel } from '@/types/financial';
import type { ScenarioSnapshot } from '@/types/scenario';

export const SCENARIO_PALETTE = [
  '#3987e5',
  '#2fd1a0',
  '#f59e0b',
  '#f0645f',
  '#9085e9',
  '#38bdf8',
] as const;

export type ScenarioMetricFormat =
  | 'currency'
  | 'percent'
  | 'ratio'
  | 'days'
  | 'slider'
  | 'check';

export interface ScenarioComparisonRow {
  id: string;
  rowKind: 'section' | 'metric';
  label: string;
  format: ScenarioMetricFormat;
  higherIsBetter: boolean | null;
  sliderControl?: ResolvedSliderControl;
  valuesByScenarioId: Record<string, number | null>;
  deltasVsBaseByScenarioId: Record<string, number | null>;
}

export interface ScenarioKpiBarCategory {
  id: string;
  label: string;
  values: number[];
}

export interface ScenarioLineSeries {
  scenarioId: string;
  name: string;
  colorHex: string;
  values: number[];
}

export interface ScenarioChartData {
  scenariosMeta: Array<{ id: string; name: string; colorHex: string; isBase: boolean }>;
  periodHeaders: string[];
  overdraftLimit: number;
  kpiCategories: string[];
  kpiSeries: ScenarioLineSeries[];
  overdraftLines: ScenarioLineSeries[];
  netIncomeLines: ScenarioLineSeries[];
}

function lastOf(arr: number[] | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  return arr[arr.length - 1] ?? null;
}

function maxOf(arr: number[] | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((m, v) => (v > m ? v : m), -Infinity);
}

function minOf(arr: number[] | undefined): number | null {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((m, v) => (v < m ? v : m), Infinity);
}

function computeRowDeltas(
  scenarios: ScenarioSnapshot[],
  baseId: string | null,
  valuesByScenarioId: Record<string, number | null>,
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  const baseVal = baseId ? valuesByScenarioId[baseId] : null;
  for (const sc of scenarios) {
    const val = valuesByScenarioId[sc.id];
    if (baseId && sc.id !== baseId && val !== null && val !== undefined && baseVal !== null && baseVal !== undefined) {
      out[sc.id] = val - baseVal;
    } else {
      out[sc.id] = null;
    }
  }
  return out;
}

function addSection(
  rows: ScenarioComparisonRow[],
  scenarios: ScenarioSnapshot[],
  id: string,
  label: string,
) {
  const empty: Record<string, number | null> = {};
  for (const sc of scenarios) empty[sc.id] = null;
  rows.push({
    id,
    rowKind: 'section',
    label,
    format: 'currency',
    higherIsBetter: null,
    valuesByScenarioId: empty,
    deltasVsBaseByScenarioId: { ...empty },
  });
}

function addMetric(
  rows: ScenarioComparisonRow[],
  scenarios: ScenarioSnapshot[],
  baseId: string | null,
  opts: {
    id: string;
    label: string;
    format: ScenarioMetricFormat;
    higherIsBetter: boolean | null;
    sliderControl?: ResolvedSliderControl;
    getter: (sc: ScenarioSnapshot) => number | null;
  },
) {
  const valuesByScenarioId: Record<string, number | null> = {};
  for (const sc of scenarios) {
    valuesByScenarioId[sc.id] = opts.getter(sc);
  }
  rows.push({
    id: opts.id,
    rowKind: 'metric',
    label: opts.label,
    format: opts.format,
    higherIsBetter: opts.higherIsBetter,
    sliderControl: opts.sliderControl,
    valuesByScenarioId,
    deltasVsBaseByScenarioId: computeRowDeltas(scenarios, baseId, valuesByScenarioId),
  });
}

function plYear(sc: ScenarioSnapshot, code: string): number | null {
  const row = sc.domain.pl.byCode[code];
  if (!row) return null;
  return row.yearValue ?? null;
}

function bsEnd(sc: ScenarioSnapshot, code: string): number | null {
  const row = sc.domain.bs.byCode[code];
  if (!row) return null;
  return lastOf(row.months);
}

function ratioEnd(sc: ScenarioSnapshot, code: string): number | null {
  const row = sc.domain.ratios.byCode[code];
  if (!row) return null;
  return row.yearValue ?? lastOf(row.months);
}

function getNetDebtEnd(sc: ScenarioSnapshot): number | null {
  const fromRt = ratioEnd(sc, 'RT_NET_DEBT');
  if (fromRt !== null) return fromRt;
  const loan = bsEnd(sc, 'BS_LOAN') ?? 0;
  const ov = bsEnd(sc, 'BS_OVERDRAFT') ?? 0;
  const sh = bsEnd(sc, 'BS_SH_LOAN') ?? 0;
  const cash = bsEnd(sc, 'BS_CASH') ?? 0;
  return loan + ov + sh - cash;
}

function getOverdraftSeries(sc: ScenarioSnapshot): number[] {
  if (sc.domain.overdraftSeries.length > 0) return sc.domain.overdraftSeries;
  return sc.domain.bs.byCode.BS_OVERDRAFT?.months ?? [];
}

function getShareholderLoanSeries(sc: ScenarioSnapshot): number[] {
  if (sc.domain.shareholderLoanSeries.length > 0) return sc.domain.shareholderLoanSeries;
  return sc.domain.bs.byCode.BS_SH_LOAN?.months ?? [];
}

export function buildScenarioComparisonRows(
  scenarios: ScenarioSnapshot[],
  baseDomain: FinancialDomainModel,
): ScenarioComparisonRow[] {
  if (scenarios.length === 0) return [];
  const rows: ScenarioComparisonRow[] = [];
  const baseSc = scenarios.find((s) => s.isBase || s.id === 'base') ?? scenarios[0];
  const baseId = baseSc?.id ?? null;

  // Sekcja 1: Zmienione założenia (Symulator)
  const changedControls = baseDomain.sliderControls.filter((ctrl) => {
    const vals = scenarios.map((sc) => sc.sliderValues[ctrl.controlKey] ?? ctrl.baseValue);
    return vals.some((v) => Math.abs(v - vals[0]) > 1e-6);
  });
  const sliderRowsToShow =
    changedControls.length > 0
      ? changedControls
      : baseDomain.sliderControls.filter((c) => c.quickBar);

  if (sliderRowsToShow.length > 0) {
    addSection(rows, scenarios, 'sec_sliders', 'ZMIENIONE ZAŁOŻENIA (SYMULATOR)');
    for (const ctrl of sliderRowsToShow) {
      addMetric(rows, scenarios, baseId, {
        id: `slider_${ctrl.controlKey}`,
        label:
          ctrl.mode === 'TABLE_COLUMN_ABS'
            ? `${ctrl.group}: ${ctrl.label}`
            : ctrl.label,
        format: 'slider',
        higherIsBetter: null,
        sliderControl: ctrl,
        getter: (sc) => sc.sliderValues[ctrl.controlKey] ?? ctrl.baseValue,
      });
    }
  }

  // Sekcja 2: Rachunek zysków i strat (Cały okres)
  const plSpecs: Array<{
    code: string;
    label: string;
    format: ScenarioMetricFormat;
    higherIsBetter: boolean | null;
  }> = [
    { code: 'PL_REV_TOTAL', label: 'Przychody ze sprzedaży', format: 'currency', higherIsBetter: true },
    { code: 'PL_VAR_TOTAL', label: 'Koszty zmienne razem', format: 'currency', higherIsBetter: false },
    { code: 'PL_CONTRIB_MARGIN', label: 'Marża po kosztach zmiennych', format: 'currency', higherIsBetter: true },
    { code: 'PL_CONTRIB_MARGIN_PCT', label: 'Marża zmienna (%)', format: 'percent', higherIsBetter: true },
    { code: 'PL_FIX_TOTAL', label: 'Koszty stałe razem', format: 'currency', higherIsBetter: false },
    { code: 'PL_EBITDA', label: 'EBITDA', format: 'currency', higherIsBetter: true },
    { code: 'PL_EBITDA_PCT', label: 'Marża EBITDA (%)', format: 'percent', higherIsBetter: true },
    { code: 'PL_EBIT', label: 'EBIT', format: 'currency', higherIsBetter: true },
    { code: 'PL_FIN_TOTAL', label: 'Koszty finansowe razem', format: 'currency', higherIsBetter: false },
    { code: 'PL_CIT', label: 'Podatek dochodowy (CIT)', format: 'currency', higherIsBetter: false },
    { code: 'PL_NET_INCOME', label: 'Wynik netto', format: 'currency', higherIsBetter: true },
    { code: 'PL_NET_MARGIN_PCT', label: 'Marża netto (%)', format: 'percent', higherIsBetter: true },
  ];

  const availablePl = plSpecs.filter((sp) =>
    scenarios.some((sc) => sc.domain.pl.byCode[sp.code] !== undefined),
  );
  if (availablePl.length > 0) {
    addSection(rows, scenarios, 'sec_pl', 'RACHUNEK ZYSKÓW I STRAT (CAŁY OKRES)');
    for (const sp of availablePl) {
      addMetric(rows, scenarios, baseId, {
        id: `pl_${sp.code}`,
        label: sp.label,
        format: sp.format,
        higherIsBetter: sp.higherIsBetter,
        getter: (sc) => plYear(sc, sp.code),
      });
    }
  }

  // Sekcja 3: Koszty wg działów (dynamicznie z baseDomain.allocation.departments)
  if (baseDomain.allocation.departments.length > 0) {
    addSection(rows, scenarios, 'sec_depts', 'KOSZTY WG DZIAŁÓW (CAŁY OKRES)');
    for (const dept of baseDomain.allocation.departments) {
      addMetric(rows, scenarios, baseId, {
        id: `dept_${dept.code}`,
        label: dept.name,
        format: 'currency',
        higherIsBetter: false,
        getter: (sc) => {
          const found = sc.domain.allocation.deptCosts.find(
            (d) => d.deptCode === dept.code,
          );
          return found ? found.yearTotal : null;
        },
      });
    }
    addMetric(rows, scenarios, baseId, {
      id: 'dept_total_cost',
      label: 'Koszty ogółem (przed CIT)',
      format: 'currency',
      higherIsBetter: false,
      getter: (sc) =>
        sc.domain.allocation.deptCosts.reduce((acc, d) => acc + d.yearTotal, 0),
    });
  }

  // Sekcja 4: Bilans, Płynność i Kowenanty
  addSection(rows, scenarios, 'sec_liquidity', 'BILANS, PŁYNNOŚĆ I KOWENANTY');
  addMetric(rows, scenarios, baseId, {
    id: 'liq_cash_end',
    label: 'Środki pieniężne na koniec okresu',
    format: 'currency',
    higherIsBetter: true,
    getter: (sc) => bsEnd(sc, 'BS_CASH'),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_min_cash',
    label: 'Minimalna gotówka w horyzoncie',
    format: 'currency',
    higherIsBetter: true,
    getter: (sc) => minOf(sc.domain.bs.byCode.BS_CASH?.months),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_peak_ov',
    label: 'Szczyt overdraftu w okresie',
    format: 'currency',
    higherIsBetter: false,
    getter: (sc) => maxOf(getOverdraftSeries(sc)),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_peak_ov_util',
    label: 'Max wykorzystanie limitu overdraftu',
    format: 'percent',
    higherIsBetter: false,
    getter: (sc) => {
      const peak = maxOf(getOverdraftSeries(sc));
      const limit = sc.domain.config.overdraftLimit;
      if (peak === null || limit <= 1e-6) return null;
      return peak / limit;
    },
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_peak_sh_loan',
    label: 'Pożyczka od wspólników (szczyt)',
    format: 'currency',
    higherIsBetter: false,
    getter: (sc) => maxOf(getShareholderLoanSeries(sc)),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_net_debt',
    label: 'Dług netto na koniec okresu',
    format: 'currency',
    higherIsBetter: false,
    getter: (sc) => getNetDebtEnd(sc),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_equity_end',
    label: 'Kapitały własne na koniec okresu',
    format: 'currency',
    higherIsBetter: true,
    getter: (sc) => bsEnd(sc, 'BS_EQUITY'),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_current_ratio',
    label: 'Płynność bieżąca (koniec)',
    format: 'ratio',
    higherIsBetter: true,
    getter: (sc) => ratioEnd(sc, 'RT_CURRENT_RATIO'),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_dso',
    label: 'DSO: dni należności (koniec)',
    format: 'days',
    higherIsBetter: false,
    getter: (sc) => ratioEnd(sc, 'RT_DSO'),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_dio',
    label: 'DIO: dni zapasów (koniec)',
    format: 'days',
    higherIsBetter: false,
    getter: (sc) => ratioEnd(sc, 'RT_DIO'),
  });
  addMetric(rows, scenarios, baseId, {
    id: 'liq_bs_diff',
    label: 'Kontrola Bilansu (max |A − P|)',
    format: 'check',
    higherIsBetter: null,
    getter: (sc) => sc.audit.integrity.maxBalanceDiff,
  });

  return rows;
}

export function buildScenarioChartData(scenarios: ScenarioSnapshot[]): ScenarioChartData {
  const firstDom = scenarios[0]?.domain;
  const periodHeaders = firstDom?.metadata.periodHeaders ?? [];
  const periodCount = periodHeaders.length;
  const overdraftLimit = firstDom?.config.overdraftLimit ?? 0;

  const scenariosMeta = scenarios.map((sc, idx) => ({
    id: sc.id,
    name: sc.name,
    colorHex: SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length],
    isBase: Boolean(sc.isBase || sc.id === 'base'),
  }));

  const kpiCategories = [
    'Przychody',
    'EBITDA',
    'Wynik netto',
    'Szczyt Overdraftu',
    'Dług netto (koniec)',
  ];

  const kpiSeries: ScenarioLineSeries[] = scenarios.map((sc, idx) => ({
    scenarioId: sc.id,
    name: sc.name,
    colorHex: SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length],
    values: [
      plYear(sc, 'PL_REV_TOTAL') ?? 0,
      plYear(sc, 'PL_EBITDA') ?? 0,
      plYear(sc, 'PL_NET_INCOME') ?? 0,
      maxOf(getOverdraftSeries(sc)) ?? 0,
      getNetDebtEnd(sc) ?? 0,
    ],
  }));

  const overdraftLines: ScenarioLineSeries[] = scenarios.map((sc, idx) => {
    const ov = getOverdraftSeries(sc);
    return {
      scenarioId: sc.id,
      name: sc.name,
      colorHex: SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length],
      values: Array.from({ length: periodCount }, (_, m) => ov[m] ?? 0),
    };
  });

  const netIncomeLines: ScenarioLineSeries[] = scenarios.map((sc, idx) => {
    const net = sc.domain.pl.byCode.PL_NET_INCOME?.months ?? [];
    return {
      scenarioId: sc.id,
      name: sc.name,
      colorHex: SCENARIO_PALETTE[idx % SCENARIO_PALETTE.length],
      values: Array.from({ length: periodCount }, (_, m) => net[m] ?? 0),
    };
  });

  return {
    scenariosMeta,
    periodHeaders,
    overdraftLimit,
    kpiCategories,
    kpiSeries,
    overdraftLines,
    netIncomeLines,
  };
}
