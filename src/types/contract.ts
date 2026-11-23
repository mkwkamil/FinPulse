export const CONTRACT_VERSION = '1.0' as const;

export const SHEET_NAMES = {
  UI: '00_Konfiguracja_UI',
  ASSUMPTIONS: '01_Zalozenia_Modelu',
  ALLOCATION: '02_Alokacja_Dzialy',
  OPERATIONS: '03_Model_Operacyjny',
  PL: '04_RZiS',
  BS: '05_Bilans',
  CF: '06_CashFlow',
  RATIOS: '07_Wskazniki',
} as const;

export const REQUIRED_SHEETS = [
  SHEET_NAMES.UI,
  SHEET_NAMES.ASSUMPTIONS,
  SHEET_NAMES.ALLOCATION,
  SHEET_NAMES.OPERATIONS,
  SHEET_NAMES.PL,
  SHEET_NAMES.BS,
  SHEET_NAMES.CF,
  SHEET_NAMES.RATIOS,
] as const;

export const REQUIRED_NAMED_RANGES = [
  'META_SCHEMA_VERSION',
  'META_COMPANY_NAME',
  'META_BUDGET_TITLE',
  'META_CURRENCY',
  'META_UNIT_SCALE',
  'META_ZERO_DATE',
  'META_DEFAULT_PERIOD',
  'META_PERIOD_HEADERS',
  'TBL_UI_SLIDERS',
  'CFG_CIT',
  'CFG_OV_LIMIT',
  'CFG_MIN_CASH',
  'CFG_HEADCOUNT_TOTAL',
  'TBL_PRODUCTS',
  'TBL_DEPARTMENTS',
  'COL_DEPT_HEADCOUNT',
  'COL_DEPT_RENT_WEIGHT',
  'COL_DEPT_RENT_SHARE',
  'TBL_COST_CATEGORIES',
  'TBL_ALLOC_MATRIX',
  'COL_ALLOC_ROW_SUMS',
  'TBL_COST_LINES_MONTHLY',
  'TBL_DEPT_COSTS_MONTHLY',
  'ROW_ALLOC_DIFF',
  'TBL_DEPT_X_CAT_YEAR',
  'STMT_PL',
  'STMT_BS',
  'ROW_BS_CHECK',
  'STMT_CF',
  'ROW_CF_CHECK',
  'STMT_RATIOS',
  'TBL_AUDIT_CHECKS',
] as const;

export const OPTIONAL_NAMED_RANGES = ['TBL_UI_PRESETS', 'ROW_OV_END', 'ROW_SL_END'] as const;

export interface ParsedA1Range {
  sheet: string;
  /** 0-based inclusive start row */
  r1: number;
  /** 0-based inclusive start col */
  c1: number;
  /** 0-based inclusive end row */
  r2: number;
  /** 0-based inclusive end col */
  c2: number;
}

export interface CellCoordinate {
  sheet: string;
  /** 0-based row */
  row: number;
  /** 0-based col */
  col: number;
}

export type SliderMode = 'DELTA_PCT' | 'ABSOLUTE' | 'TABLE_COLUMN_ABS' | 'MULTIPLIER_RANGE';

export type SliderFormat =
  | 'percent_signed'
  | 'percent'
  | 'integer_os'
  | 'weight_share'
  | 'currency'
  | 'number';

export interface SliderDefinition {
  sliderId: string;
  group: string;
  label: string;
  targetRef: string;
  mode: SliderMode;
  format: SliderFormat;
  min: number;
  max: number;
  step: number;
  quickBar: boolean;
  sortOrder: number;
  unit: string;
  tooltip: string;
}

export interface ResolvedSliderControl {
  /** Unique key e.g. 'vol' or 'hc_auto:PROD' */
  controlKey: string;
  sliderId: string;
  group: string;
  label: string;
  targetRef: string;
  mode: Exclude<SliderMode, 'TABLE_COLUMN_ABS'> | 'TABLE_COLUMN_ABS';
  format: SliderFormat;
  min: number;
  max: number;
  step: number;
  quickBar: boolean;
  sortOrder: number;
  unit: string;
  tooltip: string;
  /** Row code for TABLE_COLUMN_ABS items (e.g. 'PROD') */
  rowCode?: string;
  /** Exact cell mutated in HyperFormula */
  cell: CellCoordinate;
  /** Additional cells if MULTIPLIER_RANGE spans >1 cell */
  extraCells?: CellCoordinate[];
  baseValue: number;
}

export interface PresetDefinition {
  id: string;
  name: string;
  description: string;
  /** Map of controlKey -> target value */
  values: Record<string, number>;
}

export interface WorkbookMetadata {
  schemaVersion: string;
  companyName: string;
  budgetTitle: string;
  currency: string;
  unitScale: number;
  zeroDate: string;
  defaultPeriod: number;
  periodHeaders: string[];
}
