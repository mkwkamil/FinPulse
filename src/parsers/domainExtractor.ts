import type { AdaptedWorkbook } from '@/parsers/excelAdapter';
import type { EngineCellValue, IFormulaEngine } from '@/engine/formulaEngine';
import { isDetailedCellError } from '@/engine/formulaEngine';
import type {
  CellCoordinate,
  PresetDefinition,
  ResolvedSliderControl,
  SliderDefinition,
  SliderFormat,
  SliderMode,
  WorkbookMetadata,
} from '@/types/contract';
import type {
  AggMode,
  AllocationDomain,
  AllocMatrixRow,
  CategoryDef,
  CostLineMonthly,
  DepartmentDef,
  DeptCostMonthly,
  ExcelAuditCheckRow,
  FinancialDomainModel,
  GlobalModelConfig,
  ProductDef,
  StatementRow,
  StatementRowType,
  StatementTable,
  WaterfallRole,
} from '@/types/financial';

function toNum(v: EngineCellValue, fallback = 0): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return fallback;
}

function toNullableNum(v: EngineCellValue): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}

function toStr(v: EngineCellValue, fallback = ''): string {
  if (v === null || v === undefined || isDetailedCellError(v)) return fallback;
  return String(v).trim();
}

function toBool(v: EngineCellValue, fallback = false): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const norm = v.trim().toUpperCase();
    if (norm === 'TRUE' || norm === 'TAK' || norm === '1' || norm === 'YES') return true;
    if (norm === 'FALSE' || norm === 'NIE' || norm === '0' || norm === 'NO') return false;
  }
  return fallback;
}

function excelSerialToIsoDate(serial: number, date1904: boolean): string {
  const epochMs = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const d = new Date(epochMs + Math.round(serial) * 86_400_000);
  return d.toISOString().slice(0, 10);
}

function normalizePeriodHeader(v: EngineCellValue, date1904: boolean, fallbackIdx: number): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return excelSerialToIsoDate(v, date1904).slice(0, 7);
  }
  const s = toStr(v);
  return s || `M${fallbackIdx + 1}`;
}

function normalizeZeroDate(v: EngineCellValue, date1904: boolean): string {
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    return excelSerialToIsoDate(v, date1904);
  }
  return toStr(v, '2026-12-31');
}

function buildHeaderIndex(headerRow: EngineCellValue[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((cell, idx) => {
    const key = toStr(cell).toLowerCase();
    if (key && !map.has(key)) {
      map.set(key, idx);
    }
  });
  return map;
}

function colIdx(
  hdrMap: Map<string, number>,
  candidates: string[],
  fallbackIdx: number,
): number {
  for (const cand of candidates) {
    const found = hdrMap.get(cand.toLowerCase());
    if (found !== undefined) return found;
  }
  return fallbackIdx;
}

function safeScalar(
  engine: IFormulaEngine,
  name: string,
  fallback: EngineCellValue = '',
): EngineCellValue {
  if (!engine.hasNamedRange(name)) return fallback;
  return engine.getNamedScalar(name);
}

function extractMetadata(engine: IFormulaEngine, adapted: AdaptedWorkbook): WorkbookMetadata {
  const headerMatrix = engine.getNamedMatrix('META_PERIOD_HEADERS');
  const rawPeriods = headerMatrix[0] ?? [];
  const periodHeaders = rawPeriods.map((v, idx) =>
    normalizePeriodHeader(v, adapted.date1904, idx),
  );

  const rawSchemaVer = toStr(safeScalar(engine, 'META_SCHEMA_VERSION', '1.0'), '1.0');
  const schemaVersion = rawSchemaVer === '1' ? '1.0' : rawSchemaVer;

  return {
    schemaVersion,
    companyName: toStr(safeScalar(engine, 'META_COMPANY_NAME', 'Spółka'), 'Spółka'),
    budgetTitle: toStr(safeScalar(engine, 'META_BUDGET_TITLE', 'Budżet'), 'Budżet'),
    currency: toStr(safeScalar(engine, 'META_CURRENCY', 'PLN'), 'PLN'),
    unitScale: toNum(safeScalar(engine, 'META_UNIT_SCALE', 1000), 1000),
    zeroDate: normalizeZeroDate(safeScalar(engine, 'META_ZERO_DATE', ''), adapted.date1904),
    defaultPeriod: toNum(safeScalar(engine, 'META_DEFAULT_PERIOD', 0), 0),
    periodHeaders,
  };
}

function extractGlobalConfig(engine: IFormulaEngine): GlobalModelConfig {
  return {
    citRate: toNum(safeScalar(engine, 'CFG_CIT', 0.19), 0.19),
    overdraftLimit: toNum(safeScalar(engine, 'CFG_OV_LIMIT', 0), 0),
    minCash: toNum(safeScalar(engine, 'CFG_MIN_CASH', 0), 0),
    headcountTotal: toNum(safeScalar(engine, 'CFG_HEADCOUNT_TOTAL', 0), 0),
    daysInMonth: toNum(safeScalar(engine, 'CFG_DAYS_IN_MONTH', 30), 30),
    rawUsageFactor: toNum(safeScalar(engine, 'CFG_RAW_USAGE', 1), 1),
    onlineShare: toNum(safeScalar(engine, 'CFG_ONLINE_SHARE', 0), 0),
    q4Share: toNum(safeScalar(engine, 'CFG_Q4_SHARE', 0.25), 0.25),
  };
}

function extractProducts(engine: IFormulaEngine): ProductDef[] {
  const matrix = engine.getNamedMatrix('TBL_PRODUCTS');
  if (matrix.length < 2) return [];
  const hdr = buildHeaderIndex(matrix[0]);
  const iCode = colIdx(hdr, ['productcode', 'code'], 0);
  const iName = colIdx(hdr, ['productname', 'name'], 1);
  const iVol = colIdx(hdr, ['annualvolume', 'volume'], 2);
  const iUnit = colIdx(hdr, ['unit'], 3);
  const iPrice = colIdx(hdr, ['netprice', 'price'], 4);
  const iUse = colIdx(hdr, ['rawusagefactor', 'usage'], 5);
  const iAct = colIdx(hdr, ['activeflag', 'active'], 6);

  const out: ProductDef[] = [];
  for (let r = 1; r < matrix.length; r++) {
    const row = matrix[r];
    const code = toStr(row[iCode]);
    if (!code) continue;
    out.push({
      code,
      name: toStr(row[iName], code),
      annualVolume: toNum(row[iVol], 0),
      unit: toStr(row[iUnit], 'kg'),
      netPrice: toNum(row[iPrice], 0),
      rawUsageFactor: toNum(row[iUse], 1),
      active: toBool(row[iAct], true),
    });
  }
  return out;
}

function extractAllocation(
  engine: IFormulaEngine,
  periodCount: number,
): { allocation: AllocationDomain; deptRowIndexByCode: Map<string, number> } {
  // 1. Działy (TBL_DEPARTMENTS)
  const deptMat = engine.getNamedMatrix('TBL_DEPARTMENTS');
  const dHdr = buildHeaderIndex(deptMat[0] ?? []);
  const dCode = colIdx(dHdr, ['deptcode'], 0);
  const dName = colIdx(dHdr, ['deptname'], 1);
  const dColor = colIdx(dHdr, ['colorhex'], 2);
  const dHasHc = colIdx(dHdr, ['hasheadcount'], 3);
  const dHc = colIdx(dHdr, ['headcount'], 4);
  const dHcSh = colIdx(dHdr, ['headcountshare'], 5);
  const dHasRn = colIdx(dHdr, ['hasrentweight'], 6);
  const dRn = colIdx(dHdr, ['rentweight'], 7);
  const dRnSh = colIdx(dHdr, ['rentshare'], 8);
  const dNotes = colIdx(dHdr, ['notes'], 9);

  const departments: DepartmentDef[] = [];
  const deptRowIndexByCode = new Map<string, number>();

  for (let r = 1; r < deptMat.length; r++) {
    const row = deptMat[r];
    const code = toStr(row[dCode]);
    if (!code) continue;
    deptRowIndexByCode.set(code, r - 1);
    departments.push({
      code,
      name: toStr(row[dName], code),
      colorHex: toStr(row[dColor], '#3987e5'),
      hasHeadcount: toBool(row[dHasHc], true),
      headcount: toNum(row[dHc], 0),
      headcountShare: toNum(row[dHcSh], 0),
      hasRentWeight: toBool(row[dHasRn], true),
      rentWeight: toNum(row[dRn], 0),
      rentShare: toNum(row[dRnSh], 0),
      notes: toStr(row[dNotes], ''),
    });
  }

  // 2. Kategorie (TBL_COST_CATEGORIES)
  const catMat = engine.getNamedMatrix('TBL_COST_CATEGORIES');
  const cHdr = buildHeaderIndex(catMat[0] ?? []);
  const cCode = colIdx(cHdr, ['catcode'], 0);
  const cName = colIdx(cHdr, ['catname'], 1);
  const cShort = colIdx(cHdr, ['shortname'], 2);
  const cSort = colIdx(cHdr, ['sortorder'], 3);

  const categories: CategoryDef[] = [];
  for (let r = 1; r < catMat.length; r++) {
    const row = catMat[r];
    const code = toStr(row[cCode]);
    if (!code) continue;
    categories.push({
      code,
      name: toStr(row[cName], code),
      shortName: toStr(row[cShort], toStr(row[cName], code)),
      sortOrder: toNum(row[cSort], r * 10),
    });
  }
  categories.sort((a, b) => a.sortOrder - b.sortOrder);

  // 3. Macierz alokacji (TBL_ALLOC_MATRIX)
  const allocMat = engine.getNamedMatrix('TBL_ALLOC_MATRIX');
  const aHdrRow = allocMat[0] ?? [];
  const aHdr = buildHeaderIndex(aHdrRow);
  const aLineCode = colIdx(aHdr, ['linecode'], 0);
  const aLineName = colIdx(aHdr, ['linename'], 1);
  const aCatCode = colIdx(aHdr, ['catcode'], 2);
  const aBeh = colIdx(aHdr, ['costbehavior'], 3);
  const aRule = colIdx(aHdr, ['allocrule'], 4);
  const aRowSum = colIdx(aHdr, ['rowsum'], aHdrRow.length - 2);

  const deptColInAlloc = new Map<string, number>();
  for (const dept of departments) {
    const idx = aHdr.get(dept.code.toLowerCase());
    if (idx !== undefined) deptColInAlloc.set(dept.code, idx);
  }

  const matrix: AllocMatrixRow[] = [];
  for (let r = 1; r < allocMat.length; r++) {
    const row = allocMat[r];
    const lineCode = toStr(row[aLineCode]);
    if (!lineCode) continue;
    const weights: Record<string, number> = {};
    for (const [deptCode, idx] of deptColInAlloc.entries()) {
      weights[deptCode] = toNum(row[idx], 0);
    }
    const behRaw = toStr(row[aBeh], 'FIXED').toUpperCase();
    matrix.push({
      lineCode,
      lineName: toStr(row[aLineName], lineCode),
      catCode: toStr(row[aCatCode]),
      costBehavior: behRaw === 'VARIABLE' ? 'VARIABLE' : 'FIXED',
      allocRule: toStr(row[aRule]),
      weights,
      rowSum: toNum(row[aRowSum], 0),
    });
  }

  // 4. Koszty linii w czasie (TBL_COST_LINES_MONTHLY)
  const clMat = engine.getNamedMatrix('TBL_COST_LINES_MONTHLY');
  const clHdr = buildHeaderIndex(clMat[0] ?? []);
  const clCode = colIdx(clHdr, ['linecode'], 0);
  const clName = colIdx(clHdr, ['linename'], 1);
  const clCat = colIdx(clHdr, ['catcode'], 2);
  const clBeh = colIdx(clHdr, ['costbehavior'], 3);
  const clPeriodStart = clBeh + 1;

  const costLines: CostLineMonthly[] = [];
  for (let r = 1; r < clMat.length; r++) {
    const row = clMat[r];
    const lineCode = toStr(row[clCode]);
    if (!lineCode) continue;
    const months = Array.from({ length: periodCount }, (_, m) =>
      toNum(row[clPeriodStart + m], 0),
    );
    const yearIdx = colIdx(clHdr, ['rok', 'total', 'totalyear'], clPeriodStart + periodCount);
    const yearTotal =
      yearIdx < row.length && typeof row[yearIdx] === 'number'
        ? toNum(row[yearIdx], 0)
        : months.reduce((a, b) => a + b, 0);
    const behRaw = toStr(row[clBeh], 'FIXED').toUpperCase();
    costLines.push({
      lineCode,
      lineName: toStr(row[clName], lineCode),
      catCode: toStr(row[clCat]),
      costBehavior: behRaw === 'VARIABLE' ? 'VARIABLE' : 'FIXED',
      months,
      yearTotal,
    });
  }

  // 5. Koszty działów w czasie (TBL_DEPT_COSTS_MONTHLY)
  const dcMat = engine.getNamedMatrix('TBL_DEPT_COSTS_MONTHLY');
  const dcHdr = buildHeaderIndex(dcMat[0] ?? []);
  const dcCode = colIdx(dcHdr, ['deptcode'], 0);
  const dcName = colIdx(dcHdr, ['deptname'], 1);
  const dcPeriodStart = dcName + 1;

  const deptCosts: DeptCostMonthly[] = [];
  for (let r = 1; r < dcMat.length; r++) {
    const row = dcMat[r];
    const deptCode = toStr(row[dcCode]);
    if (!deptCode) continue;
    const months = Array.from({ length: periodCount }, (_, m) =>
      toNum(row[dcPeriodStart + m], 0),
    );
    const yearIdx = colIdx(dcHdr, ['rok', 'total', 'totalyear'], dcPeriodStart + periodCount);
    const shareIdx = colIdx(dcHdr, ['udział', 'udzial', 'costshare', 'share'], yearIdx + 1);
    const yearTotal =
      yearIdx < row.length && typeof row[yearIdx] === 'number'
        ? toNum(row[yearIdx], 0)
        : months.reduce((a, b) => a + b, 0);
    deptCosts.push({
      deptCode,
      deptName: toStr(row[dcName], deptCode),
      months,
      yearTotal,
      share: shareIdx < row.length ? toNum(row[shareIdx], 0) : 0,
    });
  }

  // 6. Macierz roczna Dział x Kategoria (TBL_DEPT_X_CAT_YEAR)
  const dxMat = engine.getNamedMatrix('TBL_DEPT_X_CAT_YEAR');
  const dxHdr = buildHeaderIndex(dxMat[0] ?? []);
  const dxCode = colIdx(dxHdr, ['deptcode'], 0);
  const deptByCategoryYear: Record<string, Record<string, number>> = {};

  for (let r = 1; r < dxMat.length; r++) {
    const row = dxMat[r];
    const deptCode = toStr(row[dxCode]);
    if (!deptCode) continue;
    const catValues: Record<string, number> = {};
    for (const cat of categories) {
      const idx = dxHdr.get(cat.code.toLowerCase());
      catValues[cat.code] = idx !== undefined ? toNum(row[idx], 0) : 0;
    }
    deptByCategoryYear[deptCode] = catValues;
  }

  return {
    allocation: {
      departments,
      categories,
      matrix,
      costLines,
      deptCosts,
      deptByCategoryYear,
    },
    deptRowIndexByCode,
  };
}

function parseStatementTable(
  engine: IFormulaEngine,
  rangeName: string,
  periodHeaders: string[],
  expectZeroColumn: boolean,
): StatementTable {
  const mat = engine.getNamedMatrix(rangeName);
  const hdrRow = mat[0] ?? [];
  const hdr = buildHeaderIndex(hdrRow);

  const iCode = colIdx(hdr, ['line_code'], 0);
  const iType = colIdx(hdr, ['row_type'], 1);
  const iAgg = colIdx(hdr, ['agg_mode'], 2);
  const iWf = colIdx(hdr, ['wf_role'], 3);
  const iLabel = colIdx(hdr, ['pozycja', 'wskaźnik', 'wskaznik', 'label', 'item'], 4);

  const detectedZeroIdx = hdrRow.findIndex((h) =>
    /^(moment\s*zero|zero|bo)$/i.test(toStr(h)),
  );
  const hasZeroColumn = detectedZeroIdx >= 0 || expectZeroColumn;
  const zeroColIdx = detectedZeroIdx >= 0 ? detectedZeroIdx : expectZeroColumn ? iLabel + 1 : -1;
  const firstMonthIdx = hasZeroColumn ? zeroColIdx + 1 : iLabel + 1;
  const periodCount = periodHeaders.length;
  const potentialYearIdx = firstMonthIdx + periodCount;
  const hasYearColumn = potentialYearIdx < hdrRow.length && toStr(hdrRow[potentialYearIdx]) !== '';

  const rows: StatementRow[] = [];
  const byCode: Record<string, StatementRow> = {};

  for (let r = 1; r < mat.length; r++) {
    const row = mat[r];
    const lineCode = toStr(row[iCode]);
    const label = toStr(row[iLabel]);
    if (!lineCode && !label) continue;

    const rowType = (toStr(row[iType], 'DETAIL').toUpperCase() || 'DETAIL') as StatementRowType;
    const aggMode = (toStr(row[iAgg], 'SUM').toUpperCase() || 'SUM') as AggMode;
    const wfRole = (toStr(row[iWf], 'NONE').toUpperCase() || 'NONE') as WaterfallRole;

    const zeroValue = hasZeroColumn ? toNullableNum(row[zeroColIdx]) : null;
    const months = Array.from({ length: periodCount }, (_, m) =>
      toNum(row[firstMonthIdx + m], 0),
    );
    const yearValue = hasYearColumn ? toNullableNum(row[potentialYearIdx]) : null;

    const stmtRow: StatementRow = {
      lineCode,
      rowType,
      aggMode,
      wfRole,
      label,
      zeroValue,
      months,
      yearValue,
    };
    rows.push(stmtRow);
    if (lineCode) {
      byCode[lineCode] = stmtRow;
    }
  }

  return {
    hasZeroColumn,
    hasYearColumn,
    periodHeaders,
    rows,
    byCode,
  };
}

function extractAuditCheckRows(engine: IFormulaEngine): ExcelAuditCheckRow[] {
  const mat = engine.getNamedMatrix('TBL_AUDIT_CHECKS');
  if (mat.length < 2) return [];
  const hdr = buildHeaderIndex(mat[0]);
  const iCode = colIdx(hdr, ['checkcode'], 0);
  const iName = colIdx(hdr, ['checkname'], 1);
  const iSev = colIdx(hdr, ['severity'], 2);
  const iAct = colIdx(hdr, ['actualvalue'], 3);
  const iTol = colIdx(hdr, ['tolerance'], 4);
  const iStat = colIdx(hdr, ['status'], 5);

  const rows: ExcelAuditCheckRow[] = [];
  for (let r = 1; r < mat.length; r++) {
    const row = mat[r];
    const checkCode = toStr(row[iCode]);
    if (!checkCode) continue;
    const sevRaw = toStr(row[iSev], 'CRITICAL').toUpperCase();
    rows.push({
      checkCode,
      checkName: toStr(row[iName], checkCode),
      severity: sevRaw === 'WARNING' ? 'WARNING' : 'CRITICAL',
      actualValue: toNum(row[iAct], 0),
      tolerance: toNum(row[iTol], 0.01),
      status: toStr(row[iStat], 'BLAD'),
    });
  }
  return rows;
}

function extractSliders(
  engine: IFormulaEngine,
  departments: DepartmentDef[],
  deptRowIndexByCode: Map<string, number>,
): { definitions: SliderDefinition[]; controls: ResolvedSliderControl[] } {
  const mat = engine.getNamedMatrix('TBL_UI_SLIDERS');
  if (mat.length < 2) return { definitions: [], controls: [] };

  const hdr = buildHeaderIndex(mat[0]);
  const iId = colIdx(hdr, ['sliderid'], 0);
  const iGroup = colIdx(hdr, ['group'], 1);
  const iLabel = colIdx(hdr, ['label'], 2);
  const iTarget = colIdx(hdr, ['targetref'], 3);
  const iMode = colIdx(hdr, ['mode'], 4);
  const iFormat = colIdx(hdr, ['format'], 5);
  const iMin = colIdx(hdr, ['min'], 6);
  const iMax = colIdx(hdr, ['max'], 7);
  const iStep = colIdx(hdr, ['step'], 8);
  const iQuick = colIdx(hdr, ['quickbar'], 9);
  const iSort = colIdx(hdr, ['sortorder'], 10);
  const iUnit = colIdx(hdr, ['unit'], 11);
  const iTip = colIdx(hdr, ['tooltip'], 12);

  const definitions: SliderDefinition[] = [];
  const controls: ResolvedSliderControl[] = [];

  for (let r = 1; r < mat.length; r++) {
    const row = mat[r];
    const sliderId = toStr(row[iId]);
    if (!sliderId) continue;

    const def: SliderDefinition = {
      sliderId,
      group: toStr(row[iGroup], 'Parametry'),
      label: toStr(row[iLabel], sliderId),
      targetRef: toStr(row[iTarget]),
      mode: (toStr(row[iMode], 'DELTA_PCT').toUpperCase() || 'DELTA_PCT') as SliderMode,
      format: (toStr(row[iFormat], 'percent_signed') || 'percent_signed') as SliderFormat,
      min: toNum(row[iMin], -0.5),
      max: toNum(row[iMax], 0.5),
      step: toNum(row[iStep], 0.01),
      quickBar: toBool(row[iQuick], false),
      sortOrder: toNum(row[iSort], r * 10),
      unit: toStr(row[iUnit], '%'),
      tooltip: toStr(row[iTip], ''),
    };
    definitions.push(def);

    const targetRange = engine.getNamedRange(def.targetRef);
    if (!targetRange) continue;

    if (def.mode === 'TABLE_COLUMN_ABS') {
      const isHcCol = def.targetRef.toUpperCase().includes('HEADCOUNT');
      const isRentCol = def.targetRef.toUpperCase().includes('RENT');

      departments.forEach((dept, idx) => {
        if (isHcCol && !dept.hasHeadcount) return;
        if (isRentCol && !dept.hasRentWeight) return;
        const rowOffset = deptRowIndexByCode.get(dept.code);
        if (rowOffset === undefined) return;
        const cell: CellCoordinate = {
          sheet: targetRange.sheet,
          row: targetRange.r1 + rowOffset,
          col: targetRange.c1,
        };
        if (engine.isFormulaCell(cell)) return;
        controls.push({
          controlKey: `${def.sliderId}:${dept.code}`,
          sliderId: def.sliderId,
          group: def.group,
          label: dept.name,
          targetRef: def.targetRef,
          mode: def.mode,
          format: def.format,
          min: def.min,
          max: def.max,
          step: def.step,
          quickBar: def.quickBar,
          sortOrder: def.sortOrder + idx * 0.01,
          unit: def.unit,
          tooltip: def.tooltip,
          rowCode: dept.code,
          cell,
          baseValue: toNum(engine.getCellValue(cell), 0),
        });
      });
    } else if (def.mode === 'MULTIPLIER_RANGE') {
      const cells: CellCoordinate[] = [];
      for (let rr = targetRange.r1; rr <= targetRange.r2; rr++) {
        for (let cc = targetRange.c1; cc <= targetRange.c2; cc++) {
          const coord = { sheet: targetRange.sheet, row: rr, col: cc };
          if (!engine.isFormulaCell(coord)) cells.push(coord);
        }
      }
      if (cells.length === 0) continue;
      controls.push({
        controlKey: def.sliderId,
        sliderId: def.sliderId,
        group: def.group,
        label: def.label,
        targetRef: def.targetRef,
        mode: def.mode,
        format: def.format,
        min: def.min,
        max: def.max,
        step: def.step,
        quickBar: def.quickBar,
        sortOrder: def.sortOrder,
        unit: def.unit,
        tooltip: def.tooltip,
        cell: cells[0],
        extraCells: cells.slice(1),
        baseValue: toNum(engine.getCellValue(cells[0]), 0),
      });
    } else {
      const cell: CellCoordinate = {
        sheet: targetRange.sheet,
        row: targetRange.r1,
        col: targetRange.c1,
      };
      if (engine.isFormulaCell(cell)) continue;
      controls.push({
        controlKey: def.sliderId,
        sliderId: def.sliderId,
        group: def.group,
        label: def.label,
        targetRef: def.targetRef,
        mode: def.mode,
        format: def.format,
        min: def.min,
        max: def.max,
        step: def.step,
        quickBar: def.quickBar,
        sortOrder: def.sortOrder,
        unit: def.unit,
        tooltip: def.tooltip,
        cell,
        baseValue: toNum(engine.getCellValue(cell), 0),
      });
    }
  }

  definitions.sort((a, b) => a.sortOrder - b.sortOrder);
  controls.sort((a, b) => a.sortOrder - b.sortOrder);
  return { definitions, controls };
}

function extractPresets(engine: IFormulaEngine): PresetDefinition[] {
  if (!engine.hasNamedRange('TBL_UI_PRESETS')) return [];
  const mat = engine.getNamedMatrix('TBL_UI_PRESETS');
  if (mat.length < 2) return [];

  const hdr = buildHeaderIndex(mat[0]);
  const iId = colIdx(hdr, ['presetid'], 0);
  const iName = colIdx(hdr, ['presetname'], 1);
  const iDesc = colIdx(hdr, ['description'], 2);
  const iSlider = colIdx(hdr, ['sliderid'], 3);
  const iVal = colIdx(hdr, ['targetvalue'], 4);

  const map = new Map<string, PresetDefinition>();
  for (let r = 1; r < mat.length; r++) {
    const row = mat[r];
    const id = toStr(row[iId]);
    if (!id) continue;
    let preset = map.get(id);
    if (!preset) {
      preset = {
        id,
        name: toStr(row[iName], id),
        description: toStr(row[iDesc], ''),
        values: {},
      };
      map.set(id, preset);
    }
    const sliderKey = toStr(row[iSlider]);
    const val = toNullableNum(row[iVal]);
    if (sliderKey && val !== null) {
      preset.values[sliderKey] = val;
    }
  }
  return [...map.values()];
}

export function extractDomainModel(
  engine: IFormulaEngine,
  adapted: AdaptedWorkbook,
): FinancialDomainModel {
  const metadata = extractMetadata(engine, adapted);
  const periodCount = metadata.periodHeaders.length;
  const config = extractGlobalConfig(engine);
  const products = extractProducts(engine);
  const { allocation, deptRowIndexByCode } = extractAllocation(engine, periodCount);
  const pl = parseStatementTable(engine, 'STMT_PL', metadata.periodHeaders, false);
  const bs = parseStatementTable(engine, 'STMT_BS', metadata.periodHeaders, true);
  const cf = parseStatementTable(engine, 'STMT_CF', metadata.periodHeaders, false);
  const ratios = parseStatementTable(engine, 'STMT_RATIOS', metadata.periodHeaders, false);
  const excelAuditChecks = extractAuditCheckRows(engine);
  const { definitions: sliderDefinitions, controls: sliderControls } = extractSliders(
    engine,
    allocation.departments,
    deptRowIndexByCode,
  );
  const presets = extractPresets(engine);

  const overdraftSeries = engine.hasNamedRange('ROW_OV_END')
    ? (engine.getNamedMatrix('ROW_OV_END')[0] ?? []).map((v) => toNum(v, 0))
    : (bs.byCode.BS_OVERDRAFT?.months ?? []);

  const shareholderLoanSeries = engine.hasNamedRange('ROW_SL_END')
    ? (engine.getNamedMatrix('ROW_SL_END')[0] ?? []).map((v) => toNum(v, 0))
    : (bs.byCode.BS_SH_LOAN?.months ?? []);

  return {
    metadata,
    config,
    products,
    allocation,
    pl,
    bs,
    cf,
    ratios,
    excelAuditChecks,
    sliderDefinitions,
    sliderControls,
    presets,
    overdraftSeries,
    shareholderLoanSeries,
  };
}
