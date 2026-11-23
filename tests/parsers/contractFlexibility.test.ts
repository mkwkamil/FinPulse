import ExcelJS from 'exceljs';
import { HyperFormula } from 'hyperformula';
import { describe, expect, it } from 'vitest';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import { REQUIRED_SHEETS } from '@/types/contract';

function colLetter(col1: number): string {
  let n = col1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * Buduje w pamięci skoroszyt Kontraktu v1.0 o zmienionych wymiarach:
 * 5 produktów × 8 działów × 10 kategorii × 18 miesięcy (2027-01 .. 2028-06),
 * wykorzystujący shared formulas (fillFormula) oraz _xlfn.MAXIFS / _xlfn.IFS.
 */
async function buildFlexible18MWorkbookBuffer(): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const sheets: Record<string, ExcelJS.Worksheet> = {};
  for (const name of REQUIRED_SHEETS) {
    sheets[name] = wb.addWorksheet(name);
  }

  const PERIODS = 18;
  const periodLabels = Array.from({ length: PERIODS }, (_, idx) => {
    const year = 2027 + Math.floor(idx / 12);
    const month = String((idx % 12) + 1).padStart(2, '0');
    return `${year}-${month}`;
  });

  // 00_Konfiguracja_UI
  const ui = sheets['00_Konfiguracja_UI'];
  const meta: Array<[string, string | number]> = [
    ['META_SCHEMA_VERSION', '1.0'],
    ['META_COMPANY_NAME', 'FLEX CORP'],
    ['META_BUDGET_TITLE', 'Budżet 18M (5x8x10)'],
    ['META_CURRENCY', 'EUR'],
    ['META_UNIT_SCALE', 1000],
    ['META_ZERO_DATE', '2026-12-31'],
    ['META_DEFAULT_PERIOD', 0],
  ];
  meta.forEach(([k, v], i) => {
    const r = i + 2;
    ui.getCell(r, 1).value = k;
    ui.getCell(r, 2).value = v;
    wb.definedNames.add(`'00_Konfiguracja_UI'!$B$${r}`, k);
  });

  const sliderHdr = [
    'SliderID',
    'Group',
    'Label',
    'TargetRef',
    'Mode',
    'Format',
    'Min',
    'Max',
    'Step',
    'QuickBar',
    'SortOrder',
    'Unit',
    'Tooltip',
  ];
  sliderHdr.forEach((h, i) => (ui.getCell(11, i + 1).value = h));
  const sliders = [
    ['vol', 'Rynek', 'Wolumen', 'SIM_VOL_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, true, 10, '%', 'Wolumen'],
    ['hc_auto', 'Obsada', 'Obsada', 'COL_DEPT_HEADCOUNT', 'TABLE_COLUMN_ABS', 'integer_os', 0, 50, 1, false, 20, 'os.', 'Kadry'],
  ];
  sliders.forEach((s, idx) =>
    s.forEach((val, ci) => (ui.getCell(12 + idx, ci + 1).value = val)),
  );
  wb.definedNames.add("'00_Konfiguracja_UI'!$A$11:$M$13", 'TBL_UI_SLIDERS');

  // 01_Zalozenia_Modelu
  const asm = sheets['01_Zalozenia_Modelu'];
  const cfgs: Array<[string, number | string, boolean]> = [
    ['SIM_VOL_DELTA', 0, false],
    ['CFG_CIT', 0.19, false],
    ['CFG_OV_LIMIT', 1000000, false],
    ['CFG_MIN_CASH', 50000, false],
    ['CFG_HEADCOUNT_TOTAL', 'SUM(COL_DEPT_HEADCOUNT)', true],
    ['CFG_WAGE', 5000, false],
    ['BO_CASH', 200000, false],
    ['BO_EQUITY', 200000, false],
  ];
  cfgs.forEach(([name, val, isFormula], idx) => {
    const r = idx + 2;
    asm.getCell(r, 1).value = name;
    asm.getCell(r, 2).value = isFormula ? { formula: String(val) } : val;
    wb.definedNames.add(`'01_Zalozenia_Modelu'!$B$${r}`, name);
  });

  // Formuła z _xlfn.MAXIFS i _xlfn.IFS (test sanityzera)
  asm.getCell('D2').value = 'A';
  asm.getCell('D3').value = 'A';
  asm.getCell('E2').value = 10;
  asm.getCell('E3').value = 30;
  asm.getCell('F2').value = { formula: '_xlfn.MAXIFS(E2:E3,D2:D3,"A")' };
  asm.getCell('F3').value = { formula: '_xlfn.IFS(F2>20,"OK",1=1,"LOW")' };

  // 5 produktów
  ['ProductCode', 'ProductName', 'AnnualVolume', 'Unit', 'NetPrice', 'RawUsageFactor', 'ActiveFlag'].forEach(
    (h, i) => (asm.getCell(12, i + 1).value = h),
  );
  for (let p = 1; p <= 5; p++) {
    const r = 12 + p;
    asm.getCell(r, 1).value = `P${p}`;
    asm.getCell(r, 2).value = `Produkt ${p}`;
    asm.getCell(r, 3).value = 1000 * p;
    asm.getCell(r, 4).value = 'szt';
    asm.getCell(r, 5).value = 100;
    asm.getCell(r, 6).value = 1;
    asm.getCell(r, 7).value = true;
  }
  wb.definedNames.add("'01_Zalozenia_Modelu'!$A$12:$G$17", 'TBL_PRODUCTS');
  wb.definedNames.add("'01_Zalozenia_Modelu'!$C$13:$C$17", 'COL_PROD_VOL');
  wb.definedNames.add("'01_Zalozenia_Modelu'!$E$13:$E$17", 'COL_PROD_PRICE');

  // 02_Alokacja_Dzialy: 8 działów x 10 kategorii
  const al = sheets['02_Alokacja_Dzialy'];
  [
    'DeptCode',
    'DeptName',
    'ColorHex',
    'HasHeadcount',
    'Headcount',
    'HeadcountShare',
    'HasRentWeight',
    'RentWeight',
    'RentShare',
    'Notes',
  ].forEach((h, i) => (al.getCell(2, i + 1).value = h));

  const deptCodes = Array.from({ length: 8 }, (_, i) => `D${i + 1}`);
  deptCodes.forEach((dc, i) => {
    const r = 3 + i;
    al.getCell(r, 1).value = dc;
    al.getCell(r, 2).value = `Dział ${i + 1}`;
    al.getCell(r, 3).value = '#3987e5';
    al.getCell(r, 4).value = true;
    al.getCell(r, 5).value = 2;
    al.getCell(r, 6).value = { formula: `E${r}/SUM(COL_DEPT_HEADCOUNT)` };
    al.getCell(r, 7).value = true;
    al.getCell(r, 8).value = 10;
    al.getCell(r, 9).value = { formula: `H${r}/SUM(COL_DEPT_RENT_WEIGHT)` };
    al.getCell(r, 10).value = '';
  });
  wb.definedNames.add("'02_Alokacja_Dzialy'!$A$2:$J$10", 'TBL_DEPARTMENTS');
  wb.definedNames.add("'02_Alokacja_Dzialy'!$E$3:$E$10", 'COL_DEPT_HEADCOUNT');
  wb.definedNames.add("'02_Alokacja_Dzialy'!$H$3:$H$10", 'COL_DEPT_RENT_WEIGHT');
  wb.definedNames.add("'02_Alokacja_Dzialy'!$I$3:$I$10", 'COL_DEPT_RENT_SHARE');

  // 10 kategorii
  ['CatCode', 'CatName', 'ShortName', 'SortOrder'].forEach((h, i) => (al.getCell(12, i + 1).value = h));
  const catCodes = Array.from({ length: 10 }, (_, i) => `C${i + 1}`);
  catCodes.forEach((cc, i) => {
    const r = 13 + i;
    al.getCell(r, 1).value = cc;
    al.getCell(r, 2).value = `Kategoria ${i + 1}`;
    al.getCell(r, 3).value = `Kat ${i + 1}`;
    al.getCell(r, 4).value = (i + 1) * 10;
  });
  wb.definedNames.add("'02_Alokacja_Dzialy'!$A$12:$D$22", 'TBL_COST_CATEGORIES');

  // Macierz alokacji (10 linii, po jednej w każdej kategorii, wagi po 1/8 = 0.125 dla 8 działów)
  ['LineCode', 'LineName', 'CatCode', 'CostBehavior', 'AllocRule', ...deptCodes, 'RowSum', 'RowCheck'].forEach(
    (h, i) => (al.getCell(24, i + 1).value = h),
  );
  catCodes.forEach((cc, i) => {
    const r = 25 + i;
    al.getCell(r, 1).value = `L${i + 1}`;
    al.getCell(r, 2).value = `Koszt ${i + 1}`;
    al.getCell(r, 3).value = cc;
    al.getCell(r, 4).value = i < 5 ? 'VARIABLE' : 'FIXED';
    al.getCell(r, 5).value = 'wg obsady';
    deptCodes.forEach((_, di) => {
      al.getCell(r, 6 + di).value = { formula: `$F$${3 + di}` };
    });
    al.getCell(r, 14).value = { formula: `SUM(F${r}:M${r})` };
    al.getCell(r, 15).value = { formula: `IF(ABS(N${r}-1)<=0.0001,"OK","BLAD")` };
  });
  wb.definedNames.add("'02_Alokacja_Dzialy'!$A$24:$O$34", 'TBL_ALLOC_MATRIX');
  wb.definedNames.add("'02_Alokacja_Dzialy'!$N$25:$N$34", 'COL_ALLOC_ROW_SUMS');

  // 03_Model_Operacyjny (18 okresów w D2:U2)
  const op = sheets['03_Model_Operacyjny'];
  periodLabels.forEach((lbl, m) => (op.getCell(2, 4 + m).value = lbl));
  wb.definedNames.add(
    `'03_Model_Operacyjny'!$D$2:$${colLetter(3 + PERIODS)}$2`,
    'META_PERIOD_HEADERS',
  );

  // 04_RZiS (18 miesięcy F..W, Rok X)
  const pl = sheets['04_RZiS'];
  const plYearCol = 5 + PERIODS + 1;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', ...periodLabels, 'Rok'].forEach(
    (h, i) => (pl.getCell(2, i + 1).value = h),
  );
  // Wiersz 3: Przychód (shared formula przez 18 miesięcy!)
  pl.getCell(3, 1).value = 'PL_REV_TOTAL';
  pl.getCell(3, 2).value = 'SUBTOTAL';
  pl.getCell(3, 3).value = 'SUM';
  pl.getCell(3, 4).value = 'START';
  pl.getCell(3, 5).value = 'Przychody';
  pl.fillFormula(
    `F3:${colLetter(5 + PERIODS)}3`,
    'SUMPRODUCT(COL_PROD_VOL,COL_PROD_PRICE)*(1+SIM_VOL_DELTA)/18',
  );
  pl.getCell(3, plYearCol).value = { formula: `SUM(F3:${colLetter(5 + PERIODS)}3)` };

  // Wiersz 4: Koszty (płace zależne od headcount)
  pl.getCell(4, 1).value = 'PL_FIX_WAGES';
  pl.getCell(4, 2).value = 'DETAIL';
  pl.getCell(4, 3).value = 'SUM';
  pl.getCell(4, 4).value = 'DELTA_NEG';
  pl.getCell(4, 5).value = 'Koszty razem';
  pl.fillFormula(
    `F4:${colLetter(5 + PERIODS)}4`,
    'CFG_HEADCOUNT_TOTAL*CFG_WAGE',
  );
  pl.getCell(4, plYearCol).value = { formula: `SUM(F4:${colLetter(5 + PERIODS)}4)` };

  // Wiersz 5: Wynik netto (shared formula =F3-F4)
  pl.getCell(5, 1).value = 'PL_NET_INCOME';
  pl.getCell(5, 2).value = 'TOTAL';
  pl.getCell(5, 3).value = 'SUM';
  pl.getCell(5, 4).value = 'END';
  pl.getCell(5, 5).value = 'Wynik netto';
  pl.fillFormula(`F5:${colLetter(5 + PERIODS)}5`, 'F3-F4');
  pl.getCell(5, plYearCol).value = { formula: `SUM(F5:${colLetter(5 + PERIODS)}5)` };
  wb.definedNames.add(`'04_RZiS'!$A$2:$${colLetter(plYearCol)}$5`, 'STMT_PL');

  // Koszty linii i działów w 02_Alokacja_Dzialy (18 miesięcy)
  ['LineCode', 'LineName', 'CatCode', 'CostBehavior', ...periodLabels, 'Rok'].forEach(
    (h, i) => (al.getCell(37, i + 1).value = h),
  );
  catCodes.forEach((cc, i) => {
    const r = 38 + i;
    al.getCell(r, 1).value = `L${i + 1}`;
    al.getCell(r, 2).value = `Koszt ${i + 1}`;
    al.getCell(r, 3).value = cc;
    al.getCell(r, 4).value = i < 5 ? 'VARIABLE' : 'FIXED';
    for (let m = 0; m < PERIODS; m++) {
      const plCol = colLetter(6 + m);
      al.getCell(r, 5 + m).value = { formula: `'04_RZiS'!${plCol}4/10` };
    }
    al.getCell(r, 5 + PERIODS).value = { formula: `SUM(E${r}:${colLetter(4 + PERIODS)}${r})` };
  });
  wb.definedNames.add(
    `'02_Alokacja_Dzialy'!$A$37:$${colLetter(5 + PERIODS)}$47`,
    'TBL_COST_LINES_MONTHLY',
  );

  ['DeptCode', 'DeptName', ...periodLabels, 'Rok', 'Udział'].forEach(
    (h, i) => (al.getCell(50, i + 1).value = h),
  );
  deptCodes.forEach((dc, di) => {
    const r = 51 + di;
    al.getCell(r, 1).value = dc;
    al.getCell(r, 2).value = `Dział ${di + 1}`;
    const wCol = colLetter(6 + di);
    for (let m = 0; m < PERIODS; m++) {
      const clCol = colLetter(5 + m);
      al.getCell(r, 3 + m).value = {
        formula: `SUMPRODUCT(${wCol}$25:${wCol}$34,${clCol}$38:${clCol}$47)`,
      };
    }
    al.getCell(r, 3 + PERIODS).value = { formula: `SUM(C${r}:${colLetter(2 + PERIODS)}${r})` };
    al.getCell(r, 4 + PERIODS).value = { formula: `1/8` };
  });
  for (let m = 0; m <= PERIODS; m++) {
    const dcCol = colLetter(3 + m);
    const plCol = colLetter(6 + m);
    al.getCell(60, 3 + m).value = {
      formula: `SUM(${dcCol}51:${dcCol}58)-'04_RZiS'!${plCol}4`,
    };
  }
  wb.definedNames.add(
    `'02_Alokacja_Dzialy'!$A$50:$${colLetter(4 + PERIODS)}$58`,
    'TBL_DEPT_COSTS_MONTHLY',
  );
  wb.definedNames.add(
    `'02_Alokacja_Dzialy'!$C$60:$${colLetter(3 + PERIODS)}$60`,
    'ROW_ALLOC_DIFF',
  );

  // Macierz 8 x 10
  ['DeptCode', 'DeptName', ...catCodes, 'Razem'].forEach((h, i) => (al.getCell(63, i + 1).value = h));
  deptCodes.forEach((dc, di) => {
    const r = 64 + di;
    al.getCell(r, 1).value = dc;
    al.getCell(r, 2).value = `Dział ${di + 1}`;
    const wCol = colLetter(6 + di);
    catCodes.forEach((_, ci) => {
      al.getCell(r, 3 + ci).value = {
        formula: `${wCol}${25 + ci}*$${colLetter(5 + PERIODS)}$${38 + ci}`,
      };
    });
    al.getCell(r, 13).value = { formula: `SUM(C${r}:L${r})` };
  });
  wb.definedNames.add("'02_Alokacja_Dzialy'!$A$63:$M$71", 'TBL_DEPT_X_CAT_YEAR');

  // 05_Bilans (Moment zero in F, 18 months in G..X)
  const bs = sheets['05_Bilans'];
  const bsLastCol = 6 + PERIODS;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', 'Moment zero', ...periodLabels].forEach(
    (h, i) => (bs.getCell(2, i + 1).value = h),
  );
  const bsRows: Array<[string, string, string]> = [
    ['BS_CASH', 'DETAIL', 'Środki pieniężne'],
    ['BS_ASSETS_TOTAL', 'TOTAL', 'AKTYWA RAZEM'],
    ['BS_EQUITY', 'DETAIL', 'Kapitały własne'],
    ['BS_OVERDRAFT', 'DETAIL', 'Overdraft'],
    ['BS_SH_LOAN', 'DETAIL', 'Pożyczka wspólników'],
    ['BS_LIAB_TOTAL', 'TOTAL', 'PASYWA RAZEM'],
    ['BS_CHECK_BALANCE', 'CHECK', 'Kontrola'],
  ];
  bsRows.forEach(([c, t, lbl], i) => {
    const r = 3 + i;
    bs.getCell(r, 1).value = c;
    bs.getCell(r, 2).value = t;
    bs.getCell(r, 3).value = 'LAST';
    bs.getCell(r, 4).value = 'NONE';
    bs.getCell(r, 5).value = lbl;
  });
  bs.getCell('F3').value = { formula: 'BO_CASH' };
  bs.getCell('F4').value = { formula: 'F3' };
  bs.getCell('F5').value = { formula: 'BO_EQUITY' };
  bs.getCell('F6').value = 0;
  bs.getCell('F7').value = 0;
  bs.getCell('F8').value = { formula: 'F5+F6+F7' };
  bs.getCell('F9').value = { formula: 'F4-F8' };

  for (let m = 0; m < PERIODS; m++) {
    const col = colLetter(7 + m);
    const prev = colLetter(6 + m);
    const plCol = colLetter(6 + m);
    bs.getCell(3, 7 + m).value = { formula: `${prev}3+'04_RZiS'!${plCol}5` };
    bs.getCell(4, 7 + m).value = { formula: `${col}3` };
    bs.getCell(5, 7 + m).value = { formula: `${prev}5+'04_RZiS'!${plCol}5` };
    bs.getCell(6, 7 + m).value = 0;
    bs.getCell(7, 7 + m).value = 0;
    bs.getCell(8, 7 + m).value = { formula: `${col}5+${col}6+${col}7` };
    bs.getCell(9, 7 + m).value = { formula: `${col}4-${col}8` };
  }
  wb.definedNames.add(`'05_Bilans'!$A$2:$${colLetter(bsLastCol)}$9`, 'STMT_BS');
  wb.definedNames.add(`'05_Bilans'!$F$9:$${colLetter(bsLastCol)}$9`, 'ROW_BS_CHECK');

  // 06_CashFlow
  const cf = sheets['06_CashFlow'];
  const cfYearCol = 5 + PERIODS + 1;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', ...periodLabels, 'Rok'].forEach(
    (h, i) => (cf.getCell(2, i + 1).value = h),
  );
  cf.getCell(3, 1).value = 'CF_CFO';
  cf.getCell(3, 2).value = 'TOTAL';
  cf.getCell(3, 3).value = 'SUM';
  cf.getCell(3, 4).value = 'NONE';
  cf.getCell(3, 5).value = 'CFO';
  cf.getCell(4, 1).value = 'CF_CASH_END';
  cf.getCell(4, 2).value = 'TOTAL';
  cf.getCell(4, 3).value = 'LAST';
  cf.getCell(4, 4).value = 'NONE';
  cf.getCell(4, 5).value = 'Gotówka koniec';
  cf.getCell(5, 1).value = 'CF_CHECK_VS_BS';
  cf.getCell(5, 2).value = 'CHECK';
  cf.getCell(5, 3).value = 'LAST';
  cf.getCell(5, 4).value = 'NONE';
  cf.getCell(5, 5).value = 'Kontrola CF';
  for (let m = 0; m < PERIODS; m++) {
    const col = colLetter(6 + m);
    const bsCol = colLetter(7 + m);
    cf.getCell(3, 6 + m).value = { formula: `'04_RZiS'!${col}5` };
    cf.getCell(4, 6 + m).value = { formula: `'05_Bilans'!${bsCol}3` };
    cf.getCell(5, 6 + m).value = { formula: `${col}4-'05_Bilans'!${bsCol}3` };
  }
  cf.getCell(3, cfYearCol).value = { formula: `SUM(F3:${colLetter(5 + PERIODS)}3)` };
  cf.getCell(4, cfYearCol).value = { formula: `${colLetter(5 + PERIODS)}4` };
  cf.getCell(5, cfYearCol).value = { formula: `${colLetter(5 + PERIODS)}5` };
  wb.definedNames.add(`'06_CashFlow'!$A$2:$${colLetter(cfYearCol)}$5`, 'STMT_CF');
  wb.definedNames.add(`'06_CashFlow'!$F$5:$${colLetter(cfYearCol)}$5`, 'ROW_CF_CHECK');

  // 07_Wskazniki
  const rt = sheets['07_Wskazniki'];
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Wskaźnik', ...periodLabels, 'Rok'].forEach(
    (h, i) => (rt.getCell(2, i + 1).value = h),
  );
  rt.getCell(3, 1).value = 'RT_CURRENT_RATIO';
  rt.getCell(3, 2).value = 'RATIO';
  rt.getCell(3, 3).value = 'LAST';
  rt.getCell(3, 4).value = 'NONE';
  rt.getCell(3, 5).value = 'Płynność bieżąca';
  for (let m = 0; m <= PERIODS; m++) {
    rt.getCell(3, 6 + m).value = 2.0;
  }
  wb.definedNames.add(`'07_Wskazniki'!$A$2:$${colLetter(6 + PERIODS)}$3`, 'STMT_RATIOS');

  ['CheckCode', 'CheckName', 'Severity', 'ActualValue', 'Tolerance', 'Status'].forEach(
    (h, i) => (rt.getCell(6, i + 1).value = h),
  );
  rt.getCell(7, 1).value = 'CHK_BS_BALANCE';
  rt.getCell(7, 2).value = 'Bilans';
  rt.getCell(7, 3).value = 'CRITICAL';
  rt.getCell(7, 4).value = { formula: 'MAX(ABS(MAX(ROW_BS_CHECK)),ABS(MIN(ROW_BS_CHECK)))' };
  rt.getCell(7, 5).value = 0.01;
  rt.getCell(7, 6).value = { formula: 'IF(D7<=E7,"OK","BLAD")' };
  wb.definedNames.add("'07_Wskazniki'!$A$6:$F$7", 'TBL_AUDIT_CHECKS');

  // Wypełnienie cache wynikami przez HyperFormula (uwzględniając shared formulas i _xlfn.)
  const hfSheets: Record<string, (string | number | boolean | null)[][]> = {};
  wb.eachSheet((ws) => {
    const mat: (string | number | boolean | null)[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const rowArr: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = ws.getCell(r, c);
        if (cell.type === ExcelJS.ValueType.Formula && cell.formula) {
          rowArr.push(`=${cell.formula.replace(/_xlfn\./g, '')}`);
        } else {
          const v = cell.value;
          rowArr.push(typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null);
        }
      }
      mat.push(rowArr);
    }
    hfSheets[ws.name] = mat;
  });

  const hf = HyperFormula.buildFromSheets(hfSheets, { licenseKey: 'gpl-v3' });
  for (const def of wb.definedNames.model as Array<{ name: string; ranges: string[] }>) {
    hf.addNamedExpression(def.name, `=${def.ranges[0]}`);
  }
  wb.eachSheet((ws) => {
    const sid = hf.getSheetId(ws.name)!;
    ws.eachRow({ includeEmpty: false }, (row, r) => {
      row.eachCell({ includeEmpty: false }, (cell, c) => {
        if (cell.type === ExcelJS.ValueType.Formula) {
          const res = hf.getCellValue({ sheet: sid, row: r - 1, col: c - 1 });
          if (typeof res === 'number' || typeof res === 'string' || typeof res === 'boolean') {
            const val = cell.value as { formula?: string; sharedFormula?: string; ref?: string; shareType?: string };
            cell.value = { ...val, result: res } as ExcelJS.CellFormulaValue;
          }
        }
      });
    });
  });
  hf.destroy();

  const raw = await wb.xlsx.writeBuffer();
  return new Uint8Array(raw).buffer;
}

describe('Elastyczność Kontraktu Danych v1.0 (5x8x10x18 + shared formulas + _xlfn.)', () => {
  it('parsuje i przelicza dowolny rozmiar modelu bez zmian w kodzie', async () => {
    const buffer = await buildFlexible18MWorkbookBuffer();
    const session = await createFinancialEngineSession(buffer, 'Flex_5x8x10_18M.xlsx');

    try {
      expect(session.baseAudit.contract.valid).toBe(true);
      expect(session.baseAudit.parity.formulaErrors).toHaveLength(0);
      expect(session.baseAudit.parity.mismatchCount).toBe(0);
      expect(session.baseAudit.integrity.maxBalanceDiff).toBeLessThan(0.01);

      const d = session.baseDomain!;
      expect(d.products).toHaveLength(5);
      expect(d.allocation.departments).toHaveLength(8);
      expect(d.allocation.categories).toHaveLength(10);
      expect(d.metadata.periodHeaders).toHaveLength(18);
      expect(d.metadata.periodHeaders[0]).toBe('2027-01');
      expect(d.metadata.periodHeaders[17]).toBe('2028-06');

      // Sprawdzenie _xlfn.MAXIFS i _xlfn.IFS
      const asmSheet = session.adapted.sheetsData['01_Zalozenia_Modelu'];
      expect(asmSheet[1][5]).toBe('=MAXIFS(E2:E3,D2:D3,"A")');
      expect(session.engine.getCellValue({ sheet: '01_Zalozenia_Modelu', row: 1, col: 5 })).toBe(30);
      expect(session.engine.getCellValue({ sheet: '01_Zalozenia_Modelu', row: 2, col: 5 })).toBe('OK');

      // Rozwinięcie 8 suwaków obsady dla 8 działów
      const hcControls = d.sliderControls.filter((c) => c.sliderId === 'hc_auto');
      expect(hcControls).toHaveLength(8);

      // Symulacja What-If na modelu 18M
      const volCtrl = d.sliderControls.find((c) => c.controlKey === 'vol')!;
      const baseRevYear = d.pl.byCode.PL_REV_TOTAL.yearValue!;
      const sim = session.applyMutations([{ coord: volCtrl.cell, value: 0.2 }]);
      expect(sim.domain.pl.byCode.PL_REV_TOTAL.yearValue!).toBeCloseTo(baseRevYear * 1.2, 2);
      expect(sim.audit.integrity.maxBalanceDiff).toBeLessThan(0.01);
      expect(sim.audit.integrity.zeroPointLocked).toBe(true);
    } finally {
      session.destroy();
    }
  });
});
