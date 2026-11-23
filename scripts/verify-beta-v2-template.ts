import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { HyperFormula, DetailedCellError } from 'hyperformula';
import path from 'node:path';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

const REQUIRED_SHEETS = [
  '00_Konfiguracja_UI',
  '01_Zalozenia_Modelu',
  '02_Alokacja_Dzialy',
  '03_Model_Operacyjny',
  '04_RZiS',
  '05_Bilans',
  '06_CashFlow',
  '07_Wskazniki',
] as const;

const REQUIRED_NAMED_RANGES = [
  'META_SCHEMA_VERSION',
  'META_COMPANY_NAME',
  'META_BUDGET_TITLE',
  'META_CURRENCY',
  'META_UNIT_SCALE',
  'META_ZERO_DATE',
  'META_DEFAULT_PERIOD',
  'META_PERIOD_HEADERS',
  'TBL_UI_SLIDERS',
  'TBL_UI_PRESETS',
  'SIM_VOL_DELTA',
  'SIM_PRICE_DELTA',
  'SIM_RAW_PRICE_DELTA',
  'SIM_PROC_DELTA',
  'SIM_LOG_DELTA',
  'SIM_MKT_DELTA',
  'SIM_WAGE_DELTA',
  'SIM_RENT_DELTA',
  'SIM_OTH_FIX_DELTA',
  'CFG_CIT',
  'CFG_OV_LIMIT',
  'CFG_MIN_CASH',
  'CFG_HEADCOUNT_TOTAL',
  'TBL_RAW_PRICES_Q',
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
  'ROW_OV_END',
  'ROW_SL_END',
] as const;

interface ParsedRange {
  sheet: string;
  r1: number; // 0-based
  c1: number; // 0-based
  r2: number; // 0-based
  c2: number; // 0-based
}

function colToZeroIdx(colStr: string): number {
  let n = 0;
  for (const ch of colStr.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

function parseA1Range(refStr: string): ParsedRange {
  const clean = refStr.replace(/^=/, '');
  const bang = clean.lastIndexOf('!');
  if (bang < 0) throw new Error(`Invalid A1 range without sheet: ${refStr}`);
  const sheet = clean.slice(0, bang).replace(/^'|'$/g, '');
  const coords = clean.slice(bang + 1);
  const [startPart, endPart] = coords.split(':');
  const parsePart = (p: string) => {
    const m = /^\$?([A-Z]+)\$?(\d+)$/i.exec(p);
    if (!m) throw new Error(`Invalid cell ref: ${p} in ${refStr}`);
    return { c: colToZeroIdx(m[1]), r: Number(m[2]) - 1 };
  };
  const s = parsePart(startPart);
  const e = endPart ? parsePart(endPart) : s;
  return {
    sheet,
    r1: Math.min(s.r, e.r),
    c1: Math.min(s.c, e.c),
    r2: Math.max(s.r, e.r),
    c2: Math.max(s.c, e.c),
  };
}

function approx(actual: unknown, expected: number, tol = 0.01, label = ''): void {
  assert.equal(typeof actual, 'number', `Expected number for ${label}, got ${String(actual)}`);
  const num = actual as number;
  const diff = Math.abs(num - expected);
  assert.ok(
    diff <= tol,
    `${label}: expected ${expected} ± ${tol}, got ${num} (diff=${diff})`,
  );
}

function numVal(v: unknown, label = ''): number {
  assert.equal(typeof v, 'number', `Expected number for ${label}, got ${String(v)}`);
  return v as number;
}

function buildHyperFormulaFromWorkbook(wb: ExcelJS.Workbook): {
  hf: HyperFormula;
  sheetIdMap: Map<string, number>;
  namedRanges: Map<string, ParsedRange>;
} {
  const sheetsData: Record<string, (string | number | boolean | null)[][]> = {};

  wb.eachSheet((ws) => {
    const matrix: (string | number | boolean | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const rowArr: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = ws.getCell(r, c);
        if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
          rowArr.push(`=${cell.formula}`);
        } else {
          const v = cell.value;
          if (v === null || v === undefined) {
            rowArr.push(null);
          } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
            rowArr.push(v);
          } else {
            rowArr.push(String(v));
          }
        }
      }
      matrix.push(rowArr);
    }
    sheetsData[ws.name] = matrix;
  });

  const hf = HyperFormula.buildFromSheets(sheetsData, {
    licenseKey: 'gpl-v3',
    leapYear1900: true,
    nullDate: { year: 1899, month: 12, day: 30 },
  });

  const namedRanges = new Map<string, ParsedRange>();
  const definedModel = wb.definedNames.model as Array<{ name: string; ranges: string[] }>;
  for (const def of definedModel) {
    if (def.name.startsWith('_xlnm.')) continue;
    if (!def.ranges || def.ranges.length === 0) continue;
    hf.addNamedExpression(def.name, `=${def.ranges[0]}`);
    namedRanges.set(def.name, parseA1Range(def.ranges[0]));
  }

  const sheetIdMap = new Map<string, number>();
  for (const name of hf.getSheetNames()) {
    const id = hf.getSheetId(name);
    if (id !== undefined) sheetIdMap.set(name, id);
  }

  return { hf, sheetIdMap, namedRanges };
}

function readRangeValues(
  hf: HyperFormula,
  sheetIdMap: Map<string, number>,
  range: ParsedRange,
): unknown[][] {
  const sheetId = sheetIdMap.get(range.sheet);
  assert.notEqual(sheetId, undefined, `Missing sheet ${range.sheet}`);
  const rows: unknown[][] = [];
  for (let r = range.r1; r <= range.r2; r++) {
    const row: unknown[] = [];
    for (let c = range.c1; c <= range.c2; c++) {
      row.push(hf.getCellValue({ sheet: sheetId!, row: r, col: c }));
    }
    rows.push(row);
  }
  return rows;
}

function getScalarNamed(
  hf: HyperFormula,
  sheetIdMap: Map<string, number>,
  namedRanges: Map<string, ParsedRange>,
  name: string,
): unknown {
  const r = namedRanges.get(name);
  assert.ok(r, `Named range ${name} not found`);
  const sheetId = sheetIdMap.get(r.sheet)!;
  return hf.getCellValue({ sheet: sheetId, row: r.r1, col: r.c1 });
}

function findStatementRow(table: unknown[][], code: string): unknown[] {
  const row = table.find((r) => r[0] === code);
  assert.ok(row, `Statement row ${code} not found`);
  return row;
}

function getAuditChecksMap(
  hf: HyperFormula,
  sheetIdMap: Map<string, number>,
  namedRanges: Map<string, ParsedRange>,
): Map<string, { severity: string; actual: number; tol: number; status: string }> {
  const tbl = readRangeValues(hf, sheetIdMap, namedRanges.get('TBL_AUDIT_CHECKS')!);
  const map = new Map<string, { severity: string; actual: number; tol: number; status: string }>();
  for (let i = 1; i < tbl.length; i++) {
    const [code, , sev, actual, tol, status] = tbl[i];
    map.set(String(code), {
      severity: String(sev),
      actual: numVal(actual, `Audit ${String(code)} actual`),
      tol: numVal(tol, `Audit ${String(code)} tol`),
      status: String(status),
    });
  }
  return map;
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(TEMPLATE_PATH);

  // 1. Sprawdzenie zakładek i Named Ranges
  const actualSheets = wb.worksheets.map((w) => w.name);
  for (const req of REQUIRED_SHEETS) {
    assert.ok(actualSheets.includes(req), `Missing required sheet: ${req}`);
  }

  const { hf, sheetIdMap, namedRanges } = buildHyperFormulaFromWorkbook(wb);
  for (const nr of REQUIRED_NAMED_RANGES) {
    assert.ok(namedRanges.has(nr), `Missing required Named Range: ${nr}`);
  }

  // 2. Parzystość cache Excela vs HyperFormula dla 100% komórek formułowych
  let checkedFormulas = 0;
  const parityDiffs: string[] = [];
  const hfErrors: string[] = [];

  wb.eachSheet((ws) => {
    const sheetId = sheetIdMap.get(ws.name)!;
    ws.eachRow({ includeEmpty: false }, (row, rIdx) => {
      row.eachCell({ includeEmpty: false }, (cell, cIdx) => {
        if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
          checkedFormulas++;
          const hfVal = hf.getCellValue({ sheet: sheetId, row: rIdx - 1, col: cIdx - 1 });
          if (hfVal instanceof DetailedCellError) {
            hfErrors.push(`${ws.name}!${cell.address}: ${hfVal.value} (${hfVal.message})`);
            return;
          }
          const cached = cell.result;
          assert.notEqual(cached, undefined, `Missing cached result at ${ws.name}!${cell.address}`);
          if (typeof cached === 'number' && typeof hfVal === 'number') {
            if (Math.abs(cached - hfVal) > 1e-6) {
              parityDiffs.push(`${ws.name}!${cell.address}: cache=${cached}, hf=${hfVal}`);
            }
          } else if (cached !== hfVal) {
            parityDiffs.push(`${ws.name}!${cell.address}: cache=${String(cached)}, hf=${String(hfVal)}`);
          }
        }
      });
    });
  });

  assert.equal(hfErrors.length, 0, `HyperFormula errors:\n${hfErrors.join('\n')}`);
  assert.equal(parityDiffs.length, 0, `Cache parity mismatches:\n${parityDiffs.join('\n')}`);
  assert.ok(checkedFormulas > 2000, `Expected >2000 formula cells, found ${checkedFormulas}`);

  // 3. Kontrola liczb bazowych względem modelu BETA
  const pl = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_PL')!);
  const bs = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_BS')!);
  const cf = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_CF')!);
  const deptCosts = readRangeValues(hf, sheetIdMap, namedRanges.get('TBL_DEPT_COSTS_MONTHLY')!);
  const deptXCat = readRangeValues(hf, sheetIdMap, namedRanges.get('TBL_DEPT_X_CAT_YEAR')!);

  // RZiS Rok = kolumna index 17 (0..3 tech, 4 label, 5..16 M1..M12, 17 Rok)
  const PL_YEAR = 17;
  approx(findStatementRow(pl, 'PL_REV_PROD_X')[PL_YEAR], 3600000, 0.01, 'PL_REV_PROD_X Rok');
  approx(findStatementRow(pl, 'PL_REV_PROD_Y')[PL_YEAR], 3300000, 0.01, 'PL_REV_PROD_Y Rok');
  approx(findStatementRow(pl, 'PL_REV_PROD_Z')[PL_YEAR], 2100000, 0.01, 'PL_REV_PROD_Z Rok');
  approx(findStatementRow(pl, 'PL_REV_TOTAL')[PL_YEAR], 9000000, 0.01, 'PL_REV_TOTAL Rok');

  approx(findStatementRow(pl, 'PL_COGS_RAW')[PL_YEAR], 3515200, 0.01, 'PL_COGS_RAW Rok');
  approx(findStatementRow(pl, 'PL_VAR_PROC')[PL_YEAR], 780000, 0.01, 'PL_VAR_PROC Rok');
  approx(findStatementRow(pl, 'PL_VAR_LOG')[PL_YEAR], 832000, 0.01, 'PL_VAR_LOG Rok');
  approx(findStatementRow(pl, 'PL_VAR_MKT')[PL_YEAR], 720000, 0.01, 'PL_VAR_MKT Rok');
  approx(findStatementRow(pl, 'PL_VAR_SUB')[PL_YEAR], 270000, 0.01, 'PL_VAR_SUB Rok');
  approx(findStatementRow(pl, 'PL_VAR_TOTAL')[PL_YEAR], 6117200, 0.01, 'PL_VAR_TOTAL Rok');
  approx(findStatementRow(pl, 'PL_CONTRIB_MARGIN')[PL_YEAR], 2882800, 0.01, 'PL_CONTRIB_MARGIN Rok');
  approx(findStatementRow(pl, 'PL_CONTRIB_MARGIN_PCT')[PL_YEAR], 2882800 / 9000000, 1e-6, 'PL_CONTRIB_MARGIN_PCT Rok');

  approx(findStatementRow(pl, 'PL_FIX_TOTAL')[PL_YEAR], 3621000, 0.01, 'PL_FIX_TOTAL Rok');
  approx(findStatementRow(pl, 'PL_GRANT_RELEASE')[PL_YEAR], 120000, 0.01, 'PL_GRANT_RELEASE Rok');
  approx(findStatementRow(pl, 'PL_EBITDA')[PL_YEAR], -618200, 0.01, 'PL_EBITDA Rok');
  approx(findStatementRow(pl, 'PL_DEPR')[PL_YEAR], 600000, 0.01, 'PL_DEPR Rok');
  approx(findStatementRow(pl, 'PL_EBIT')[PL_YEAR], -1218200, 0.01, 'PL_EBIT Rok');

  approx(findStatementRow(pl, 'PL_FIN_INT_LOAN')[PL_YEAR], 61912.5, 0.01, 'PL_FIN_INT_LOAN Rok');
  approx(findStatementRow(pl, 'PL_FIN_FEE')[PL_YEAR], 20000, 0.01, 'PL_FIN_FEE Rok');
  approx(findStatementRow(pl, 'PL_FIN_INT_OV')[PL_YEAR], 37579.8441, 0.01, 'PL_FIN_INT_OV Rok');
  approx(findStatementRow(pl, 'PL_FIN_INT_SH_LOAN')[PL_YEAR], 0, 0.01, 'PL_FIN_INT_SH_LOAN Rok');
  approx(findStatementRow(pl, 'PL_FIN_TOTAL')[PL_YEAR], 119492.3441, 0.01, 'PL_FIN_TOTAL Rok');
  approx(findStatementRow(pl, 'PL_CIT')[PL_YEAR], 0, 0.01, 'PL_CIT Rok');
  approx(findStatementRow(pl, 'PL_NET_INCOME')[PL_YEAR], -1337692.3441, 0.01, 'PL_NET_INCOME Rok');

  // M10 = idx 14, M11 = idx 15, M12 = idx 16
  const netRow = findStatementRow(pl, 'PL_NET_INCOME');
  approx(netRow[14], 1904.8815, 0.01, 'PL_NET_INCOME M10');
  approx(netRow[15], 547.0923, 0.01, 'PL_NET_INCOME M11');
  approx(netRow[16], -41678.4951, 0.01, 'PL_NET_INCOME M12');

  // Bilans: Moment Zero = idx 5, M1..M12 = idx 6..17
  const BS_ZERO = 5;
  const BS_M11 = 16;
  const BS_M12 = 17;
  const baseAssetsZero = findStatementRow(bs, 'BS_ASSETS_TOTAL')[BS_ZERO];
  const baseLiabZero = findStatementRow(bs, 'BS_LIAB_TOTAL')[BS_ZERO];
  approx(baseAssetsZero, 7500000, 0.01, 'BS_ASSETS_TOTAL BO');
  approx(baseLiabZero, 7500000, 0.01, 'BS_LIAB_TOTAL BO');
  const baseZeroVector = bs.map((r) => r[BS_ZERO]);

  approx(findStatementRow(bs, 'BS_ASSETS_TOTAL')[BS_M12], 8544800, 0.01, 'BS_ASSETS_TOTAL M12');
  approx(findStatementRow(bs, 'BS_LIAB_TOTAL')[BS_M12], 8544800, 0.01, 'BS_LIAB_TOTAL M12');
  approx(findStatementRow(bs, 'BS_OVERDRAFT')[BS_M12], 1640092.3441, 0.01, 'BS_OVERDRAFT M12');
  approx(findStatementRow(bs, 'BS_OVERDRAFT')[BS_M11], 1667147.1823, 0.01, 'BS_OVERDRAFT M11');
  approx(findStatementRow(bs, 'BS_CASH')[BS_M12], 200000, 0.01, 'BS_CASH M12');
  approx(findStatementRow(bs, 'BS_EQUITY')[BS_M12], 2162307.6559, 0.01, 'BS_EQUITY M12');
  approx(findStatementRow(bs, 'BS_LOAN')[BS_M12], 1800000, 0.01, 'BS_LOAN M12');

  // Cash Flow: Rok = idx 17
  approx(findStatementRow(cf, 'CF_CFO')[17], -740092.3441, 0.01, 'CF_CFO Rok');
  approx(findStatementRow(cf, 'CF_CFI')[17], -2000000, 0.01, 'CF_CFI Rok');
  approx(findStatementRow(cf, 'CF_CFF')[17], 2440092.3441, 0.01, 'CF_CFF Rok');
  approx(findStatementRow(cf, 'CF_NET_CASH_CHANGE')[17], -300000, 0.01, 'CF_NET_CASH_CHANGE Rok');

  // Alokacja działów: Rok = idx 14 (0 DeptCode, 1 DeptName, 2..13 M1..M12, 14 Rok, 15 Share)
  const expectedDeptTotals: Record<string, number> = {
    PROD: 6786160,
    LOG: 1328560,
    MKT: 923280,
    SPRZ: 544920,
    ADM: 755280,
    FIN: 119492.3441,
  };
  let deptTotalSum = 0;
  for (let i = 1; i < deptCosts.length; i++) {
    const code = String(deptCosts[i][0]);
    const val = numVal(deptCosts[i][14], `Dept ${code} Rok`);
    approx(val, expectedDeptTotals[code], 0.01, `Dept ${code} Rok`);
    deptTotalSum += val;
  }
  approx(deptTotalSum, 10457692.3441, 0.01, 'Dept costs total Rok');

  // Macierz Dział x Kategoria (0 DeptCode, 1 DeptName, 2..9 cats, 10 Razem)
  const matHdr = deptXCat[0].map(String);
  const catColIdx = (c: string) => matHdr.indexOf(c);
  const matRow = (d: string) => deptXCat.find((r) => r[0] === d)!;
  approx(matRow('PROD')[catColIdx('MAT')], 3515200, 0.01, 'PROD x MAT');
  approx(matRow('PROD')[catColIdx('PER')], 1422960, 0.01, 'PROD x PER');
  approx(matRow('LOG')[catColIdx('LOG')], 832000, 0.01, 'LOG x LOG');
  const matGrandSum = deptXCat.slice(1).reduce((acc, r) => acc + numVal(r[10], 'Matrix row sum'), 0);
  approx(matGrandSum, 10457692.3441, 0.01, 'TBL_DEPT_X_CAT_YEAR total');

  // Wszystkie 8 audytów bazowych = OK
  const baseChecks = getAuditChecksMap(hf, sheetIdMap, namedRanges);
  assert.equal(baseChecks.size, 8, 'Expected 8 checks in TBL_AUDIT_CHECKS');
  for (const [code, chk] of baseChecks.entries()) {
    assert.equal(chk.status, 'OK', `Base audit check ${code} failed: actual=${chk.actual}, tol=${chk.tol}`);
  }

  // Helper do mutacji nazwanych skalarów / komórek tabelarycznych i resetu
  const setNamedScalar = (name: string, val: number) => {
    const r = namedRanges.get(name)!;
    assert.ok(r, `Unknown named range ${name}`);
    hf.setCellContents({ sheet: sheetIdMap.get(r.sheet)!, row: r.r1, col: r.c1 }, [[val]]);
  };

  const resetAllSimAndKeys = () => {
    const deptTbl = readRangeValues(hf, sheetIdMap, namedRanges.get('TBL_DEPARTMENTS')!);
    const prodIdx = deptTbl.findIndex((r) => r[0] === 'PROD') - 1;
    const hcRange = namedRanges.get('COL_DEPT_HEADCOUNT')!;
    const rnRange = namedRanges.get('COL_DEPT_RENT_WEIGHT')!;
    hf.batch(() => {
      for (const simName of [
        'SIM_VOL_DELTA',
        'SIM_PRICE_DELTA',
        'SIM_RAW_PRICE_DELTA',
        'SIM_PROC_DELTA',
        'SIM_LOG_DELTA',
        'SIM_MKT_DELTA',
        'SIM_WAGE_DELTA',
        'SIM_RENT_DELTA',
        'SIM_OTH_FIX_DELTA',
      ]) {
        setNamedScalar(simName, 0);
      }
      hf.setCellContents(
        { sheet: sheetIdMap.get(hcRange.sheet)!, row: hcRange.r1 + prodIdx, col: hcRange.c1 },
        [[14]],
      );
      hf.setCellContents(
        { sheet: sheetIdMap.get(rnRange.sheet)!, row: rnRange.r1 + prodIdx, col: rnRange.c1 },
        [[55]],
      );
    });
  };

  const assertZeroPointLocked = (testLabel: string) => {
    const curBs = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_BS')!);
    curBs.forEach((row, idx) => {
      assert.deepEqual(
        row[BS_ZERO],
        baseZeroVector[idx],
        `${testLabel}: Moment Zero mutated at BS row ${String(row[0])}`,
      );
    });
  };

  // 4. Stress-Test A: Optymistyczny z CIT > 0
  hf.batch(() => {
    setNamedScalar('SIM_VOL_DELTA', 0.25);
    setNamedScalar('SIM_PRICE_DELTA', 0.15);
    setNamedScalar('SIM_RAW_PRICE_DELTA', -0.1);
  });
  {
    const plA = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_PL')!);
    const ebtYear = numVal(findStatementRow(plA, 'PL_EBT')[PL_YEAR], 'TestA EBT');
    const citYear = numVal(findStatementRow(plA, 'PL_CIT')[PL_YEAR], 'TestA CIT');
    assert.ok(citYear > 0, `Test A expected CIT > 0, got ${citYear}`);
    approx(citYear, 0.19 * ebtYear, 0.01, 'Test A CIT = 19% * EBT');
    const checksA = getAuditChecksMap(hf, sheetIdMap, namedRanges);
    assert.ok(checksA.get('CHK_BS_BALANCE')!.actual < 0.01, 'Test A BS balance');
    assert.ok(checksA.get('CHK_CF_VS_BS')!.actual < 0.01, 'Test A CF vs BS');
    assert.ok(checksA.get('CHK_ALLOC_VS_PL')!.actual < 0.01, 'Test A Alloc vs PL');
    assertZeroPointLocked('Test A');
  }
  resetAllSimAndKeys();

  // 5. Stress-Test B: Kryzys płynności -> Pożyczka wspólników
  hf.batch(() => {
    setNamedScalar('SIM_VOL_DELTA', -0.3);
    setNamedScalar('SIM_PRICE_DELTA', -0.2);
    setNamedScalar('SIM_RAW_PRICE_DELTA', 0.3);
  });
  {
    const plB = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_PL')!);
    const bsB = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_BS')!);
    const ovSeries = findStatementRow(bsB, 'BS_OVERDRAFT').slice(6, 18).map((v) => numVal(v, 'OV'));
    const slSeries = findStatementRow(bsB, 'BS_SH_LOAN').slice(6, 18).map((v) => numVal(v, 'SL'));
    const cashSeries = findStatementRow(bsB, 'BS_CASH').slice(6, 18).map((v) => numVal(v, 'Cash'));
    const slInterestYear = numVal(findStatementRow(plB, 'PL_FIN_INT_SH_LOAN')[PL_YEAR], 'SL int');

    assert.ok(Math.max(...ovSeries) <= 3000000.01, `Test B max OV exceeded limit: ${Math.max(...ovSeries)}`);
    assert.ok(Math.max(...slSeries) > 0, 'Test B expected shareholder loan > 0');
    assert.ok(slInterestYear > 0, 'Test B expected shareholder loan interest > 0');
    assert.ok(Math.min(...cashSeries) >= 199999.99, `Test B min cash below buffer: ${Math.min(...cashSeries)}`);

    const checksB = getAuditChecksMap(hf, sheetIdMap, namedRanges);
    assert.ok(checksB.get('CHK_BS_BALANCE')!.actual < 0.01, 'Test B BS balance');
    assert.ok(checksB.get('CHK_CF_VS_BS')!.actual < 0.01, 'Test B CF vs BS');
    assert.ok(checksB.get('CHK_ALLOC_VS_PL')!.actual < 0.01, 'Test B Alloc vs PL');
    assert.equal(checksB.get('CHK_SH_LOAN_TRIGGERED')!.status, 'UWAGA', 'Test B expected UWAGA for SH loan');
    assertZeroPointLocked('Test B');
  }
  resetAllSimAndKeys();

  // 6. Stress-Test C: Zmiana obsady i wag najmu
  {
    const deptTbl = readRangeValues(hf, sheetIdMap, namedRanges.get('TBL_DEPARTMENTS')!);
    const prodIdx = deptTbl.findIndex((r) => r[0] === 'PROD') - 1;
    const hcRange = namedRanges.get('COL_DEPT_HEADCOUNT')!;
    const rnRange = namedRanges.get('COL_DEPT_RENT_WEIGHT')!;
    hf.batch(() => {
      hf.setCellContents(
        { sheet: sheetIdMap.get(hcRange.sheet)!, row: hcRange.r1 + prodIdx, col: hcRange.c1 },
        [[18]],
      );
      hf.setCellContents(
        { sheet: sheetIdMap.get(rnRange.sheet)!, row: rnRange.r1 + prodIdx, col: rnRange.c1 },
        [[70]],
      );
    });
  }
  {
    const hcTotal = numVal(getScalarNamed(hf, sheetIdMap, namedRanges, 'CFG_HEADCOUNT_TOTAL'), 'CFG_HEADCOUNT_TOTAL');
    assert.equal(hcTotal, 29, `Test C expected CFG_HEADCOUNT_TOTAL === 29, got ${hcTotal}`);

    const plC = readRangeValues(hf, sheetIdMap, namedRanges.get('STMT_PL')!);
    const wagesM1 = numVal(findStatementRow(plC, 'PL_FIX_WAGES')[5], 'Wages M1');
    approx(wagesM1, 203000, 0.01, 'Test C Wages M1 = 29 * 7000');

    const rentShares = readRangeValues(hf, sheetIdMap, namedRanges.get('COL_DEPT_RENT_SHARE')!).map((r) =>
      numVal(r[0], 'RentShare'),
    );
    const rentShareSum = rentShares.reduce((a, b) => a + b, 0);
    approx(rentShareSum, 1, 1e-6, 'Test C SUM(RentShare) = 1');

    const checksC = getAuditChecksMap(hf, sheetIdMap, namedRanges);
    assert.ok(checksC.get('CHK_ALLOC_VS_PL')!.actual < 0.01, 'Test C Alloc vs PL');
    assert.ok(checksC.get('CHK_BS_BALANCE')!.actual < 0.01, 'Test C BS balance');
    assertZeroPointLocked('Test C');
  }

  console.log(
    `VERIFICATION PASSED: ${REQUIRED_SHEETS.length} sheets, ${namedRanges.size} named ranges, ${checkedFormulas} formulas verified 1:1 with cache, BETA baseline exact match, and 3 What-If stress tests passed.`,
  );
}

main().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
