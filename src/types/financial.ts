import type {
  PresetDefinition,
  ResolvedSliderControl,
  SliderDefinition,
  WorkbookMetadata,
} from './contract';

export type StatementRowType =
  | 'SECTION'
  | 'DETAIL'
  | 'SUBTOTAL'
  | 'TOTAL'
  | 'PCT'
  | 'RATIO'
  | 'DAYS'
  | 'CHECK';

export type AggMode = 'SUM' | 'LAST' | 'FIRST' | 'RATIO_REF' | 'NONE';

export type WaterfallRole = 'START' | 'DELTA_NEG' | 'DELTA_POS' | 'SUBTOTAL' | 'END' | 'NONE';

export interface StatementRow {
  lineCode: string;
  rowType: StatementRowType;
  aggMode: AggMode;
  wfRole: WaterfallRole;
  label: string;
  zeroValue: number | null;
  months: number[];
  yearValue: number | null;
}

export interface StatementTable {
  hasZeroColumn: boolean;
  hasYearColumn: boolean;
  periodHeaders: string[];
  rows: StatementRow[];
  byCode: Record<string, StatementRow>;
}

export interface ProductDef {
  code: string;
  name: string;
  annualVolume: number;
  unit: string;
  netPrice: number;
  rawUsageFactor: number;
  active: boolean;
}

export interface DepartmentDef {
  code: string;
  name: string;
  colorHex: string;
  hasHeadcount: boolean;
  headcount: number;
  headcountShare: number;
  hasRentWeight: boolean;
  rentWeight: number;
  rentShare: number;
  notes: string;
}

export interface CategoryDef {
  code: string;
  name: string;
  shortName: string;
  sortOrder: number;
}

export interface AllocMatrixRow {
  lineCode: string;
  lineName: string;
  catCode: string;
  costBehavior: 'VARIABLE' | 'FIXED';
  allocRule: string;
  weights: Record<string, number>;
  rowSum: number;
}

export interface CostLineMonthly {
  lineCode: string;
  lineName: string;
  catCode: string;
  costBehavior: 'VARIABLE' | 'FIXED';
  months: number[];
  yearTotal: number;
}

export interface DeptCostMonthly {
  deptCode: string;
  deptName: string;
  months: number[];
  yearTotal: number;
  share: number;
}

export interface AllocationDomain {
  departments: DepartmentDef[];
  categories: CategoryDef[];
  matrix: AllocMatrixRow[];
  costLines: CostLineMonthly[];
  deptCosts: DeptCostMonthly[];
  /** deptCode -> catCode -> year PLN */
  deptByCategoryYear: Record<string, Record<string, number>>;
}

export interface ExcelAuditCheckRow {
  checkCode: string;
  checkName: string;
  severity: 'CRITICAL' | 'WARNING';
  actualValue: number;
  tolerance: number;
  status: string;
}

export interface GlobalModelConfig {
  citRate: number;
  overdraftLimit: number;
  minCash: number;
  headcountTotal: number;
  daysInMonth: number;
  rawUsageFactor: number;
  onlineShare: number;
  q4Share: number;
}

export interface FinancialDomainModel {
  metadata: WorkbookMetadata;
  config: GlobalModelConfig;
  products: ProductDef[];
  allocation: AllocationDomain;
  pl: StatementTable;
  bs: StatementTable;
  cf: StatementTable;
  ratios: StatementTable;
  excelAuditChecks: ExcelAuditCheckRow[];
  sliderDefinitions: SliderDefinition[];
  sliderControls: ResolvedSliderControl[];
  presets: PresetDefinition[];
  /** Helper series from 03_Model_Operacyjny when exposed */
  overdraftSeries: number[];
  shareholderLoanSeries: number[];
}
