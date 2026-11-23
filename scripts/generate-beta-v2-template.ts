import ExcelJS from 'exceljs';
import { HyperFormula, DetailedCellError } from 'hyperformula';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUTPUT_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

const SHEET_NAMES = {
  UI: '00_Konfiguracja_UI',
  ASSUMPTIONS: '01_Zalozenia_Modelu',
  ALLOCATION: '02_Alokacja_Dzialy',
  OPERATIONS: '03_Model_Operacyjny',
  PL: '04_RZiS',
  BS: '05_Bilans',
  CF: '06_CashFlow',
  RATIOS: '07_Wskazniki',
} as const;

const MONTHS_PL = [
  'sty 2027',
  'lut 2027',
  'mar 2027',
  'kwi 2027',
  'maj 2027',
  'cze 2027',
  'lip 2027',
  'sie 2027',
  'wrz 2027',
  'paź 2027',
  'lis 2027',
  'gru 2027',
] as const;

const PERIOD_ISO = [
  '2027-01',
  '2027-02',
  '2027-03',
  '2027-04',
  '2027-05',
  '2027-06',
  '2027-07',
  '2027-08',
  '2027-09',
  '2027-10',
  '2027-11',
  '2027-12',
] as const;

type CellRole =
  | 'title'
  | 'subtitle'
  | 'infoBanner'
  | 'section'
  | 'tableHeader'
  | 'input'
  | 'formula'
  | 'link'
  | 'subtotal'
  | 'total'
  | 'pct'
  | 'check'
  | 'tech'
  | 'text';

const NUM_FMT = {
  plainInt: '#,##0',
  int: '#,##0;-#,##0;"-"',
  pln: '#,##0;-#,##0;"-"',
  pln2: '#,##0.00;-#,##0.00;"-"',
  pct1: '0.0%;-0.0%;"-"',
  pct1Zero: '0.0%',
  pct2: '0.00%;-0.00%;"-"',
  ratio: '0.00;-0.00;"-"',
  days: '#,##0.0;-#,##0.0;"-"',
} as const;

const FILLS = {
  headerDark: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF0F172A' } },
  sectionBar: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1E293B' } },
  infoBg: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } },
  subtotal: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF1F5F9' } },
  total: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFE2E8F0' } },
  inputSoft: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF9C3' } },
  techBg: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } },
  zeroCol: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFEFF6FF' } },
};

const FONTS = {
  title: { name: 'Calibri', size: 14, bold: true, color: { argb: 'FF0F172A' } },
  subtitle: { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } },
  infoBanner: { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF1E3A8A' } },
  section: { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } },
  tableHeader: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FFFFFFFF' } },
  input: { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF1D4ED8' } },
  formula: { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF0F172A' } },
  link: { name: 'Calibri', size: 10, bold: false, color: { argb: 'FF15803D' } },
  subtotal: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } },
  total: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F172A' } },
  pct: { name: 'Calibri', size: 10, italic: true, color: { argb: 'FF475569' } },
  check: { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0369A1' } },
  tech: { name: 'Consolas', size: 9, color: { argb: 'FF64748B' } },
};

const BORDERS = {
  thin: {
    top: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin' as const, color: { argb: 'FFE2E8F0' } },
  },
  subtotal: {
    top: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
    bottom: { style: 'thin' as const, color: { argb: 'FF94A3B8' } },
  },
  total: {
    top: { style: 'thin' as const, color: { argb: 'FF334155' } },
    bottom: { style: 'double' as const, color: { argb: 'FF334155' } },
  },
};

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

function cellRef(col1: number, row1: number, absCol = false, absRow = false): string {
  return `${absCol ? '$' : ''}${colLetter(col1)}${absRow ? '$' : ''}${row1}`;
}

function rangeRef(
  sheetName: string,
  c1: number,
  r1: number,
  c2?: number,
  r2?: number,
): string {
  const start = cellRef(c1, r1, true, true);
  if (c2 === undefined || r2 === undefined || (c1 === c2 && r1 === r2)) {
    return `'${sheetName}'!${start}`;
  }
  const end = cellRef(c2, r2, true, true);
  return `'${sheetName}'!${start}:${end}`;
}

function qRef(sheetName: string, ref: string): string {
  return `'${sheetName}'!${ref}`;
}

function setRowHeightByRole(ws: ExcelJS.Worksheet, rowNum: number, role: CellRole): void {
  const row = ws.getRow(rowNum);
  const desired: Record<CellRole, number> = {
    title: 26,
    subtitle: 20,
    infoBanner: 30,
    section: 23,
    tableHeader: 28,
    total: 22,
    subtotal: 20,
    input: 19,
    formula: 19,
    link: 19,
    pct: 19,
    check: 19,
    text: 19,
    tech: 17,
  };
  const nextH = desired[role] ?? 19;
  if (!row.height || nextH > row.height) {
    row.height = nextH;
  }
}

function styleCell(
  cell: ExcelJS.Cell,
  role: CellRole,
  numFmt?: string,
  align?: 'left' | 'right' | 'center',
): void {
  switch (role) {
    case 'title':
      cell.font = FONTS.title;
      break;
    case 'subtitle':
      cell.font = FONTS.subtitle;
      break;
    case 'infoBanner':
      cell.font = FONTS.infoBanner;
      cell.fill = FILLS.infoBg;
      cell.border = BORDERS.subtotal;
      break;
    case 'section':
      cell.font = FONTS.section;
      cell.fill = FILLS.sectionBar;
      break;
    case 'tableHeader':
      cell.font = FONTS.tableHeader;
      cell.fill = FILLS.headerDark;
      break;
    case 'input':
      cell.font = FONTS.input;
      cell.border = BORDERS.thin;
      break;
    case 'formula':
      cell.font = FONTS.formula;
      cell.border = BORDERS.thin;
      break;
    case 'link':
      cell.font = FONTS.link;
      cell.border = BORDERS.thin;
      break;
    case 'subtotal':
      cell.font = FONTS.subtotal;
      cell.fill = FILLS.subtotal;
      cell.border = BORDERS.subtotal;
      break;
    case 'total':
      cell.font = FONTS.total;
      cell.fill = FILLS.total;
      cell.border = BORDERS.total;
      break;
    case 'pct':
      cell.font = FONTS.pct;
      cell.border = BORDERS.thin;
      break;
    case 'check':
      cell.font = FONTS.check;
      cell.border = BORDERS.thin;
      break;
    case 'tech':
      cell.font = FONTS.tech;
      cell.fill = FILLS.techBg;
      cell.border = BORDERS.thin;
      break;
    case 'text':
      cell.font = FONTS.formula;
      cell.border = BORDERS.thin;
      break;
  }
  if (numFmt) {
    cell.numFmt = numFmt;
  }
  const wrapText = role === 'tableHeader' || role === 'infoBanner';
  if (align || role === 'tableHeader' || role === 'section' || role === 'subtitle' || role === 'infoBanner') {
    cell.alignment = {
      horizontal: align ?? 'left',
      vertical: 'middle',
      ...(wrapText ? { wrapText: true } : {}),
    };
  }
  setRowHeightByRole(cell.worksheet, Number(cell.row), role);
}

function polishWorksheetAppearance(
  ws: ExcelJS.Worksheet,
  opts: { tabColor: string; hiddenCols?: number[] },
): void {
  ws.properties.tabColor = { argb: opts.tabColor };
  if (opts.hiddenCols) {
    for (const c of opts.hiddenCols) {
      ws.getColumn(c).hidden = true;
    }
  }
}

function setFormula(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  formula: string,
  role: CellRole = 'formula',
  numFmt?: string,
  align: 'left' | 'right' | 'center' = 'right',
): ExcelJS.Cell {
  const cell = ws.getCell(row, col);
  cell.value = { formula };
  styleCell(cell, role, numFmt, align);
  return cell;
}

function setVal(
  ws: ExcelJS.Worksheet,
  row: number,
  col: number,
  value: string | number | boolean | null,
  role: CellRole = 'input',
  numFmt?: string,
  align?: 'left' | 'right' | 'center',
): ExcelJS.Cell {
  const cell = ws.getCell(row, col);
  cell.value = value;
  const effectiveAlign = align ?? (typeof value === 'number' ? 'right' : 'left');
  styleCell(cell, role, numFmt, effectiveAlign);
  return cell;
}

function fillSectionRow(
  ws: ExcelJS.Worksheet,
  row: number,
  title: string,
  fromCol: number,
  toCol: number,
): void {
  setVal(ws, row, fromCol, title, 'section', undefined, 'left');
  for (let c = fromCol + 1; c <= toCol; c++) {
    styleCell(ws.getCell(row, c), 'section');
  }
}

interface RowRegistry {
  op: Record<string, number>;
  pl: Record<string, number>;
  bs: Record<string, number>;
  cf: Record<string, number>;
  rt: Record<string, number>;
  allocDept: Record<string, number>;
  allocLine: Record<string, number>;
  costLineRow: Record<string, number>;
  deptCostRow: Record<string, number>;
  ranges: {
    rawPricesQ: { start: number; end: number };
    productsStart: number;
    productsEnd: number;
    deptStart: number;
    deptEnd: number;
    allocStart: number;
    allocEnd: number;
    costLinesStart: number;
    costLinesEnd: number;
    deptCostsStart: number;
    deptCostsEnd: number;
    costLinesTotalRow: number;
    allocDiffRow: number;
  };
}

function build00UI(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet(SHEET_NAMES.UI);
  ws.views = [{ state: 'frozen', ySplit: 0 }];

  setVal(
    ws,
    1,
    1,
    'FinPulse / BETA — Konfiguracja interfejsu i kontraktu modelu (v1.0)',
    'title',
    undefined,
    'left',
  );
  setVal(
    ws,
    2,
    1,
    'Zakładka techniczna sterująca panelem suwaków i presetów w aplikacji FinPulse. Podczas standardowego budżetowania nie wymaga edycji.',
    'subtitle',
    undefined,
    'left',
  );

  // Sekcja 1: Metadane
  fillSectionRow(ws, 4, '1. METADANE MODELU', 1, 3);
  ['Klucz', 'Wartość', 'Opis'].forEach((h, idx) =>
    setVal(ws, 5, idx + 1, h, 'tableHeader', undefined, 'left'),
  );

  const metaRows: Array<[string, string | number, string, string?]> = [
    ['META_SCHEMA_VERSION', '1.0', 'Wersja kontraktu danych FinPulse'],
    ['META_COMPANY_NAME', 'BETA Sp. z o.o.', 'Nazwa spółki wyświetlana w nagłówku'],
    ['META_BUDGET_TITLE', 'Budżet 12M, rok 2027', 'Tytuł modelu i horyzontu budżetowego'],
    ['META_CURRENCY', 'PLN', 'Waluta bazowa sprawozdań'],
    ['META_UNIT_SCALE', 1000, 'Skala prezentacji tabel (1000 = tys.)', NUM_FMT.plainInt],
    ['META_ZERO_DATE', '2026-12-31', 'Data bilansu otwarcia (Moment zero)'],
    ['META_DEFAULT_PERIOD', 10, 'Domyślny okres po uruchomieniu (1–12 lub 0 = cały rok)', NUM_FMT.plainInt],
  ];

  metaRows.forEach(([key, val, desc, fmt], idx) => {
    const r = 6 + idx;
    setVal(ws, r, 1, key, 'tech', undefined, 'left');
    setVal(ws, r, 2, val, 'input', fmt, typeof val === 'number' ? 'right' : 'left');
    setVal(ws, r, 3, desc, 'text', undefined, 'left');
    wb.definedNames.add(rangeRef(SHEET_NAMES.UI, 2, r), key);
  });

  // Sekcja 2: Tabela Suwaków
  fillSectionRow(ws, 14, '2. KONFIGURACJA SUWAKÓW SYMULACJI (WHAT-IF)', 1, 13);
  const sliderHeaders = [
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
  sliderHeaders.forEach((h, idx) =>
    setVal(ws, 15, idx + 1, h, 'tableHeader', undefined, idx >= 6 && idx <= 10 ? 'right' : 'left'),
  );

  const sliders: Array<
    [string, string, string, string, string, string, number, number, number, boolean, number, string, string]
  > = [
    ['vol', 'Rynek', 'Wolumen sprzedaży', 'SIM_VOL_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, true, 10, '%', 'Zmiana wolumenu wszystkich produktów'],
    ['price', 'Rynek', 'Cena sprzedaży', 'SIM_PRICE_DELTA', 'DELTA_PCT', 'percent_signed', -0.2, 0.2, 0.01, true, 20, '%', 'Zmiana cen sprzedaży netto wszystkich produktów'],
    ['raw', 'Koszty zmienne', 'Cena surowca S', 'SIM_RAW_PRICE_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, true, 30, '%', 'Przesunięcie krzywej cen zakupu surowca Q1–Q4'],
    ['proc', 'Koszty zmienne', 'Koszt przetworzenia', 'SIM_PROC_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, false, 40, '%', 'Zmiana stawki przetworzenia i konfekcji'],
    ['log', 'Koszty zmienne', 'Stawki logistyki', 'SIM_LOG_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, false, 50, '%', 'Zmiana stawek logistyki krajowej i eksportowej'],
    ['mkt', 'Koszty zmienne', 'Marketing performance', 'SIM_MKT_DELTA', 'DELTA_PCT', 'percent_signed', -0.5, 0.5, 0.01, false, 60, '%', 'Zmiana intensywności wydatków marketing performance'],
    ['pay', 'Koszty stałe', 'Stawka wynagrodzeń', 'SIM_WAGE_DELTA', 'DELTA_PCT', 'percent_signed', -0.2, 0.2, 0.01, true, 70, '%', 'Zmiana średniego wynagrodzenia brutto'],
    ['rent', 'Koszty stałe', 'Najem', 'SIM_RENT_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, false, 80, '%', 'Zmiana łącznego kosztu najmu'],
    ['oth', 'Koszty stałe', 'Pozostałe koszty stałe', 'SIM_OTH_FIX_DELTA', 'DELTA_PCT', 'percent_signed', -0.3, 0.3, 0.01, false, 90, '%', 'Zmiana pozostałych kosztów operacyjnych stałych'],
    ['hc_auto', 'Obsada (osoby)', 'Obsada wg działów', 'COL_DEPT_HEADCOUNT', 'TABLE_COLUMN_ABS', 'integer_os', 0, 40, 1, false, 100, 'os.', 'Zmienia łączny koszt płac/ZUS oraz klucz alokacji'],
    ['rn_auto', 'Podział najmu (wagi)', 'Wagi najmu wg działów', 'COL_DEPT_RENT_WEIGHT', 'TABLE_COLUMN_ABS', 'weight_share', 0, 100, 5, false, 200, 'pkt', 'Wagi powierzchni — udziały normalizowane do 100%'],
  ];

  sliders.forEach((s, idx) => {
    const r = 16 + idx;
    const isPct = s[5] === 'percent_signed';
    s.forEach((val, ci) => {
      const c = ci + 1;
      const role: CellRole = c === 1 || c === 4 || c === 5 || c === 6 ? 'tech' : typeof val === 'number' ? 'input' : 'text';
      const fmt =
        c >= 7 && c <= 9
          ? isPct
            ? NUM_FMT.pct1Zero
            : NUM_FMT.plainInt
          : c === 11
            ? NUM_FMT.plainInt
            : undefined;
      setVal(ws, r, c, val, role, fmt, typeof val === 'number' ? 'right' : c === 10 ? 'center' : 'left');
    });
  });

  const sliderEndRow = 15 + sliders.length;
  wb.definedNames.add(rangeRef(SHEET_NAMES.UI, 1, 15, 13, sliderEndRow), 'TBL_UI_SLIDERS');

  // Sekcja 3: Presety
  const presetSecRow = sliderEndRow + 2;
  const presetHdrRow = presetSecRow + 1;
  fillSectionRow(ws, presetSecRow, '3. PREDEFINIOWANE SCENARIUSZE (PRESETY)', 1, 5);
  ['PresetID', 'PresetName', 'Description', 'SliderID', 'TargetValue'].forEach((h, idx) =>
    setVal(ws, presetHdrRow, idx + 1, h, 'tableHeader', undefined, idx === 4 ? 'right' : 'left'),
  );

  const presets: Array<[string, string, string, string, number | null]> = [
    ['BASE', 'Budżet bazowy', 'Resetuje mnożniki i przywraca klucze z Excela', '', null],
    ['PESSIMISTIC', 'Pesymistyczny', 'Spadek popytu -15%, presja cenowa i surowcowa +15%', 'vol', -0.15],
    ['PESSIMISTIC', 'Pesymistyczny', 'Spadek popytu -15%, presja cenowa i surowcowa +15%', 'price', -0.05],
    ['PESSIMISTIC', 'Pesymistyczny', 'Spadek popytu -15%, presja cenowa i surowcowa +15%', 'raw', 0.15],
    ['PESSIMISTIC', 'Pesymistyczny', 'Spadek popytu -15%, presja cenowa i surowcowa +15%', 'pay', 0.05],
    ['PESSIMISTIC', 'Pesymistyczny', 'Spadek popytu -15%, presja cenowa i surowcowa +15%', 'log', 0.08],
    ['OPTIMISTIC', 'Optymistyczny', 'Wzrost wolumenu +10%, ceny +3%, tańszy surowiec -5%', 'vol', 0.1],
    ['OPTIMISTIC', 'Optymistyczny', 'Wzrost wolumenu +10%, ceny +3%, tańszy surowiec -5%', 'price', 0.03],
    ['OPTIMISTIC', 'Optymistyczny', 'Wzrost wolumenu +10%, ceny +3%, tańszy surowiec -5%', 'raw', -0.05],
    ['OPTIMISTIC', 'Optymistyczny', 'Wzrost wolumenu +10%, ceny +3%, tańszy surowiec -5%', 'proc', -0.03],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'mkt', -0.15],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'oth', -0.15],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'rent', -0.1],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'log', -0.05],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'hc_auto:ADM', 1],
    ['SAVINGS', 'Oszczędności', 'Redukcja kosztów stałych, marketingu i obsady adm./sprz.', 'hc_auto:SPRZ', 2],
  ];

  presets.forEach(([pid, pname, desc, sid, tval], idx) => {
    const r = presetHdrRow + 1 + idx;
    setVal(ws, r, 1, pid, 'tech', undefined, 'left');
    setVal(ws, r, 2, pname, 'text', undefined, 'left');
    setVal(ws, r, 3, desc, 'text', undefined, 'left');
    setVal(ws, r, 4, sid, 'tech', undefined, 'left');
    if (tval === null) {
      setVal(ws, r, 5, null, 'input', undefined, 'right');
    } else {
      const fmt = sid.startsWith('hc_auto') ? NUM_FMT.int : NUM_FMT.pct1;
      setVal(ws, r, 5, tval, 'input', fmt, 'right');
    }
  });

  const presetEndRow = presetHdrRow + presets.length;
  wb.definedNames.add(rangeRef(SHEET_NAMES.UI, 1, presetHdrRow, 5, presetEndRow), 'TBL_UI_PRESETS');

  ws.columns = [
    { width: 24 },
    { width: 24 },
    { width: 42 },
    { width: 22 },
    { width: 18 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
    { width: 44 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF64748B' });
}

function build01Assumptions(wb: ExcelJS.Workbook, reg: RowRegistry): { headcountRow: number } {
  const ws = wb.addWorksheet(SHEET_NAMES.ASSUMPTIONS);
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  setVal(ws, 1, 1, 'BETA — Założenia do budżetu 12M (sty–gru 2027, Moment Zero: 31.12.2026)', 'title', undefined, 'left');
  setVal(ws, 2, 1, 'Niebieskie: dane wejściowe i szoki symulacyjne; czarne: formuły; zielone: linki międzyarkuszowe. Wszystkie kwoty w PLN netto.', 'subtitle', undefined, 'left');
  setVal(
    ws,
    3,
    1,
    'Nawigacja: edytuj wyłącznie komórki z niebieskim tekstem (żółte tło = szoki symulacyjne). Formuły (czarne) i linki (zielone) przeliczają się automatycznie. Zakładka 00_Konfiguracja_UI (na końcu) steruje suwakami FinPulse.',
    'infoBanner',
    undefined,
    'left',
  );
  for (let c = 2; c <= 5; c++) {
    styleCell(ws.getCell(3, c), 'infoBanner');
  }

  ['Kod (Named Range)', 'Założenie', 'Wartość', 'Jedn.', 'Uwagi'].forEach((h, idx) =>
    setVal(ws, 5, idx + 1, h, 'tableHeader', undefined, idx === 2 ? 'right' : 'left'),
  );

  let row = 6;
  const addSection = (title: string) => {
    fillSectionRow(ws, row, title, 1, 5);
    row++;
  };
  const addParam = (
    name: string | null,
    label: string,
    val: number | string,
    unit: string,
    notes: string,
    fmt: string,
    role: CellRole = 'input',
  ): number => {
    const r = row++;
    setVal(ws, r, 1, name ?? '', 'tech', undefined, 'left');
    setVal(ws, r, 2, label, 'text', undefined, 'left');
    if (role === 'formula' || role === 'link' || role === 'subtotal' || role === 'total') {
      setFormula(ws, r, 3, String(val), role, fmt, 'right');
    } else {
      setVal(ws, r, 3, val, role, fmt, 'right');
    }
    setVal(ws, r, 4, unit, 'text', undefined, 'center');
    setVal(ws, r, 5, notes, 'text', undefined, 'left');
    if (name) {
      wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 3, r), name);
    }
    return r;
  };

  // Blok A: SIM_*
  addSection('A. MNOŻNIKI SYMULACJI WHAT-IF (DOMYŚLNIE 0% = BUDŻET BAZOWY)');
  const simParams: Array<[string, string, string]> = [
    ['SIM_VOL_DELTA', 'Szok wolumenu sprzedaży', 'Zmiana procentowa wolumenu wszystkich produktów'],
    ['SIM_PRICE_DELTA', 'Szok cen sprzedaży', 'Zmiana procentowa cen netto wszystkich produktów'],
    ['SIM_RAW_PRICE_DELTA', 'Szok ceny surowca S', 'Przesunięcie krzywej cen surowca Q1–Q4'],
    ['SIM_PROC_DELTA', 'Szok kosztu przetworzenia', 'Zmiana stawki przetworzenia i konfekcji'],
    ['SIM_LOG_DELTA', 'Szok stawek logistyki', 'Zmiana stawek logistyki krajowej i eksportowej'],
    ['SIM_MKT_DELTA', 'Szok marketing performance', 'Zmiana intensywności marketingu performance'],
    ['SIM_WAGE_DELTA', 'Szok stawki wynagrodzeń', 'Zmiana średniego wynagrodzenia brutto'],
    ['SIM_RENT_DELTA', 'Szok kosztu najmu', 'Zmiana miesięcznego kosztu najmu'],
    ['SIM_OTH_FIX_DELTA', 'Szok pozostałych kosztów stałych', 'Zmiana pozostałych kosztów stałych'],
  ];
  for (const [nm, lbl, note] of simParams) {
    const r = addParam(nm, lbl, 0, '%', note, NUM_FMT.pct1Zero, 'input');
    ws.getCell(r, 3).fill = FILLS.inputSoft;
  }

  // Blok B: CFG_*
  addSection('B.1 SPRZEDAŻ I KANAŁY');
  addParam('CFG_Q4_SHARE', 'Udział Q4 w sprzedaży rocznej', 0.4, '%', 'Pozostałe 60% rozłożone równo na Q1–Q3', NUM_FMT.pct1);
  addParam('CFG_ONLINE_SHARE', 'Udział sprzedaży online (marketplace + D2C)', 0.75, '%', 'Pozostałe 25% to sprzedaż B2B / hurt', NUM_FMT.pct1);

  addSection('B.2 SUROWIEC S I ZAPASY');
  addParam('CFG_RAW_USAGE', 'Zużycie surowca na 1 kg produktu', 1.2, 'kg/kg', 'Z uwzględnieniem ubytku', NUM_FMT.ratio);
  const q1Row = addParam(null, 'Cena surowca Q1', 20, 'PLN/kg', 'TBL_RAW_PRICES_Q[1]', NUM_FMT.pln2);
  addParam(null, 'Cena surowca Q2', 22, 'PLN/kg', 'TBL_RAW_PRICES_Q[2]', NUM_FMT.pln2);
  addParam(null, 'Cena surowca Q3', 24, 'PLN/kg', 'TBL_RAW_PRICES_Q[3]', NUM_FMT.pln2);
  const q4Row = addParam(null, 'Cena surowca Q4', 26, 'PLN/kg', 'TBL_RAW_PRICES_Q[4]', NUM_FMT.pln2);
  reg.ranges.rawPricesQ = { start: q1Row, end: q4Row };
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 3, q1Row, 3, q4Row), 'TBL_RAW_PRICES_Q');
  addParam('CFG_RAW_PRICE_PREV', 'Cena surowca w Q4 roku poprzedniego', 20, 'PLN/kg', 'Zakupy na sprzedaż w sty i lut', NUM_FMT.pln2);
  addParam('CFG_SAFETY_STOCK', 'Zapas bezpieczeństwa surowca (stały)', 1000000, 'PLN', 'Niezależny od produkcji, stały w całym roku', NUM_FMT.pln);

  addSection('B.3 KOSZTY ZMIENNE');
  addParam('CFG_PROC_COST', 'Koszt przetworzenia i konfekcji', 6, 'PLN/kg', '', NUM_FMT.pln2);
  addParam('CFG_EXPORT_SHARE', 'Udział wolumenu sprzedawanego za granicę', 0.3, '%', '', NUM_FMT.pct1);
  addParam('CFG_LOG_EXPORT', 'Logistyka – eksport', 12, 'PLN/kg', '', NUM_FMT.pln2);
  addParam('CFG_LOG_DOMESTIC', 'Logistyka – kraj', 4, 'PLN/kg', '', NUM_FMT.pln2);
  addParam('CFG_MKT_PERF_RATE', 'Marketing performance', 0.08, '% przych.', 'Ponoszony w miesiącu sprzedaży', NUM_FMT.pct1);
  addParam('CFG_SUBCONTRACT_RATE', 'Podwykonawcy', 0.03, '% przych. rok', 'Rozłożone równomiernie 1/12 rocznej kwoty co miesiąc', NUM_FMT.pct1);

  addSection('B.4 KOSZTY STAŁE I PODATKI');
  // Formuła dla CFG_HEADCOUNT_TOTAL zostanie ustawiona po utworzeniu 02_Alokacja_Dzialy
  const headcountRow = addParam(
    'CFG_HEADCOUNT_TOTAL',
    'Liczba pracowników (łączna z alokacji)',
    0,
    'osób',
    'Single Source of Truth: =SUM(COL_DEPT_HEADCOUNT)',
    NUM_FMT.int,
    'input',
  );
  addParam('CFG_AVG_WAGE', 'Średnie wynagrodzenie brutto', 7000, 'PLN/mc/os.', '', NUM_FMT.pln);
  addParam('CFG_ZUS_RATE', 'Narzut ZUS (pracodawca)', 0.21, '% brutto', '', NUM_FMT.pct1);
  addParam('CFG_RENT_MONTHLY', 'Najem (zakład + magazyn + biuro)', 30000, 'PLN/mc', '', NUM_FMT.pln);
  addParam('CFG_SALES_FIXED_MONTHLY', 'Koszty sprzedaży stałe', 20000, 'PLN/mc', '', NUM_FMT.pln);
  addParam('CFG_OTHER_FIXED_MONTHLY', 'Pozostałe koszty stałe', 40000, 'PLN/mc', '', NUM_FMT.pln);
  addParam('CFG_CIT', 'Stawka CIT', 0.19, '%', 'Liczony od skumulowanego EBT bez aktywa ze straty', NUM_FMT.pct1);

  addSection('B.5 MAJĄTEK TRWAŁY I KREDYT INWESTYCYJNY');
  addParam('CFG_EXISTING_DEPR_ANNUAL', 'Amortyzacja roczna istniejących aktywów', 500000, 'PLN/rok', '', NUM_FMT.pln);
  addParam('CFG_CAPEX_AMOUNT', 'Nowa linia produkcyjna – nakład', 2000000, 'PLN', '', NUM_FMT.pln);
  addParam('CFG_CAPEX_MONTH', 'Miesiąc zakupu linii i uruchomienia kredytu', 6, 'nr mies.', '6 = Czerwiec', NUM_FMT.plainInt);
  addParam('CFG_NEW_LINE_DEPR_RATE', 'Stawka amortyzacji nowej linii', 0.1, '% rocznie', 'Liniowa od miesiąca następnego po zakupie', NUM_FMT.pct1);
  addParam('CFG_LOAN_AMOUNT', 'Kwota kredytu inwestycyjnego', 2000000, 'PLN', 'Finansuje 100% nakładu', NUM_FMT.pln);
  addParam('CFG_LOAN_FEE_RATE', 'Prowizja przygotowawcza', 0.01, '% kredytu', 'Koszt finansowy w miesiącu uruchomienia', NUM_FMT.pct2);
  addParam('CFG_LOAN_MARGIN', 'Marża kredytu', 0.025, '%', '', NUM_FMT.pct2);
  addParam('CFG_WIBOR_3M', 'WIBOR 3M', 0.0385, '%', '', NUM_FMT.pct2);
  addParam('CFG_WIBOR_1M', 'WIBOR 1M', 0.0376, '%', '', NUM_FMT.pct2);
  addParam('CFG_LOAN_FIRST_REP_MONTH', 'Miesiąc pierwszej raty kapitałowej', 9, 'nr mies.', '9 = Wrzesień', NUM_FMT.plainInt);
  addParam('CFG_LOAN_REP_FREQ', 'Częstotliwość rat', 3, 'mies.', 'Kwartalnie', NUM_FMT.plainInt);
  addParam('CFG_LOAN_INSTALLMENTS', 'Liczba rat kapitałowych', 20, 'rat', 'Okres 5 lat, równe raty kapitałowe', NUM_FMT.plainInt);

  addSection('B.6 TERMINY PŁATNOŚCI I DOTACJA UE');
  addParam('CFG_DSO_ONLINE', 'Sprzedaż online – dni do wpływu', 14, 'dni', '', NUM_FMT.plainInt);
  addParam('CFG_DSO_B2B', 'Sprzedaż B2B – efektywny termin', 90, 'dni', '60 + 30 dni opóźnienia (3 miesiące)', NUM_FMT.plainInt);
  addParam('CFG_DPO_RAW', 'Dostawcy surowca – termin płatności', 30, 'dni', 'Płatność w miesiącu następnym', NUM_FMT.plainInt);
  addParam('CFG_DAYS_IN_MONTH', 'Dni w miesiącu', 30, 'dni', '', NUM_FMT.plainInt);
  addParam('CFG_GRANT_MONTHLY', 'Miesięczne rozliczenie dotacji UE', 10000, 'PLN/mc', 'Przychód bezgotówkowy w RZiS', NUM_FMT.pln);

  addSection('B.7 PŁYNNOŚĆ I FINANSOWANIE BIEŻĄCE');
  addParam('CFG_OV_LIMIT', 'Limit overdraftu', 3000000, 'PLN', '', NUM_FMT.pln);
  addParam('CFG_OV_MARGIN', 'Marża overdraftu (ponad WIBOR 1M)', 0.015, '%', 'Odsetki od salda na początek miesiąca', NUM_FMT.pct2);
  addParam('CFG_MIN_CASH', 'Minimalny stan gotówki', 200000, 'PLN', 'Nadwyżka spłaca overdraft / pożyczkę wspólników', NUM_FMT.pln);
  addParam('CFG_SH_LOAN_MARGIN', 'Marża pożyczki wspólników (ponad WIBOR 3M)', 0.02, '%', 'Uruchamiana po wyczerpaniu limitu overdraftu', NUM_FMT.pct2);

  // Blok C: Zamrożony Bilans Otwarcia (BO_*)
  addSection('C. BILANS OTWARCIA – MOMENT ZERO (31.12.2026, ZAMROŻONY)');
  addParam('BO_FA_NET', 'Aktywa trwałe netto (BO)', 3000000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_INV_SAFETY', 'Zapasy – zapas bezpieczeństwa (BO)', 1000000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_INV_RAW', 'Zapasy – surowiec na sty i lut (BO)', 416000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_INV_OTHER', 'Zapasy – pozostałe zapasy stałe (BO)', 584000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_INV_TOTAL', 'Zapasy razem (BO)', 'SUM(BO_INV_SAFETY,BO_INV_RAW,BO_INV_OTHER)', 'PLN', 'Suma zapasów otwarcia', NUM_FMT.pln, 'subtotal');
  addParam('BO_AR_ONLINE', 'Należności handlowe online (BO)', 315000, 'PLN', '14 dni sprzedaży grudnia 2026 (stan zamrożony)', NUM_FMT.pln);
  addParam('BO_AR_B2B', 'Należności handlowe B2B (BO)', 1185000, 'PLN', 'Należności B2B z Q4 2026 (stan zamrożony)', NUM_FMT.pln);
  addParam('BO_AR_TOTAL', 'Należności handlowe razem (BO)', 'BO_AR_ONLINE+BO_AR_B2B', 'PLN', 'Suma należności handlowych otwarcia', NUM_FMT.pln, 'subtotal');
  addParam('BO_OTHER_AR', 'Pozostałe należności (BO)', 500000, 'PLN', 'Poziom stały w całym roku', NUM_FMT.pln);
  addParam('BO_CASH', 'Środki pieniężne (BO)', 500000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_ASSETS_TOTAL', 'AKTYWA RAZEM (BO)', 'BO_FA_NET+BO_INV_TOTAL+BO_AR_TOTAL+BO_OTHER_AR+BO_CASH', 'PLN', 'Suma bilansowa aktywów otwarcia', NUM_FMT.pln, 'total');

  addParam('BO_EQUITY', 'Kapitały własne (BO)', 3500000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_AP_RAW', 'Zobowiązania wobec dostawców surowca (BO)', 208000, 'PLN', 'Zakup z grudnia 2026 (stan zamrożony)', NUM_FMT.pln);
  addParam('BO_AP_OTHER', 'Pozostałe zobowiązania handlowe (BO)', 1792000, 'PLN', 'Poziom stały w całym roku', NUM_FMT.pln);
  addParam('BO_AP_TOTAL', 'Zobowiązania handlowe razem (BO)', 'BO_AP_RAW+BO_AP_OTHER', 'PLN', 'Suma zobowiązań handlowych otwarcia', NUM_FMT.pln, 'subtotal');
  addParam('BO_DEFERRED_GRANT', 'Rozliczenia międzyokresowe bierne – dotacja UE (BO)', 1000000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_LOAN', 'Kredyt inwestycyjny (BO)', 0, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_OVERDRAFT', 'Overdraft wykorzystany (BO)', 1000000, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_SH_LOAN', 'Pożyczka od wspólników (BO)', 0, 'PLN', 'Stan na 31.12.2026', NUM_FMT.pln);
  addParam('BO_LIAB_TOTAL', 'PASYWA RAZEM (BO)', 'BO_EQUITY+BO_AP_TOTAL+BO_DEFERRED_GRANT+BO_LOAN+BO_OVERDRAFT+BO_SH_LOAN', 'PLN', 'Suma bilansowa pasywów otwarcia', NUM_FMT.pln, 'total');

  // Blok D: Tabela Produktów (TBL_PRODUCTS)
  row++;
  fillSectionRow(ws, row, 'D. TABELA PRODUKTÓW (TBL_PRODUCTS)', 1, 7);
  row++;
  const prodHdrRow = row++;
  ['ProductCode', 'ProductName', 'AnnualVolume', 'Unit', 'NetPrice', 'RawUsageFactor', 'ActiveFlag'].forEach(
    (h, idx) =>
      setVal(
        ws,
        prodHdrRow,
        idx + 1,
        h,
        'tableHeader',
        undefined,
        idx === 2 || idx === 4 || idx === 5 ? 'right' : idx === 3 || idx === 6 ? 'center' : 'left',
      ),
  );

  const products: Array<[string, string, number, string, number, boolean]> = [
    ['PROD_X', 'Produkt X', 40000, 'kg', 90, true],
    ['PROD_Y', 'Produkt Y', 60000, 'kg', 55, true],
    ['PROD_Z', 'Produkt Z', 30000, 'kg', 70, true],
  ];

  const prodStart = row;
  products.forEach(([code, name, vol, unit, price, active]) => {
    const r = row++;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, name, 'text', undefined, 'left');
    setVal(ws, r, 3, vol, 'input', NUM_FMT.int, 'right');
    setVal(ws, r, 4, unit, 'text', undefined, 'center');
    setVal(ws, r, 5, price, 'input', NUM_FMT.pln2, 'right');
    setFormula(ws, r, 6, 'CFG_RAW_USAGE', 'formula', NUM_FMT.ratio, 'right');
    setVal(ws, r, 7, active, 'input', undefined, 'center');
  });
  const prodEnd = row - 1;

  reg.ranges.productsStart = prodStart;
  reg.ranges.productsEnd = prodEnd;

  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 1, prodHdrRow, 7, prodEnd), 'TBL_PRODUCTS');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 1, prodStart, 1, prodEnd), 'COL_PROD_CODE');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 3, prodStart, 3, prodEnd), 'COL_PROD_VOL');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 5, prodStart, 5, prodEnd), 'COL_PROD_PRICE');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 6, prodStart, 6, prodEnd), 'COL_PROD_RAW_USAGE');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ASSUMPTIONS, 7, prodStart, 7, prodEnd), 'COL_PROD_ACTIVE');

  ws.columns = [
    { width: 26 },
    { width: 46 },
    { width: 16 },
    { width: 14 },
    { width: 52 },
    { width: 16 },
    { width: 12 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF1D4ED8' });

  return { headcountRow };
}

function build02AllocationStructure(wb: ExcelJS.Workbook, reg: RowRegistry): {
  deptHdrRow: number;
  allocHdrRow: number;
  costLinesHdrRow: number;
  deptCostsHdrRow: number;
  matrixCatStartCol: number;
  deptXCatHdrRow: number;
  helperStartCol: number;
} {
  const ws = wb.addWorksheet(SHEET_NAMES.ALLOCATION);
  ws.views = [{ state: 'frozen', ySplit: 0 }];

  setVal(ws, 1, 2, 'BETA — Alokacja kosztów na działy i kategorie (v1.0)', 'title', undefined, 'left');
  setVal(ws, 2, 2, 'Obsada i wagi najmu sterują zarówno kluczami alokacji, jak i łącznymi kosztami kadr w modelu. Kolumny techniczne (A oraz S:X) są ukryte.', 'subtitle', undefined, 'left');

  // Sekcja 1: TBL_DEPARTMENTS
  fillSectionRow(ws, 4, '1. SŁOWNIK DZIAŁÓW I KLUCZE ALOKACJI (TBL_DEPARTMENTS)', 2, 10);
  const deptHdrRow = 5;
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
  ].forEach((h, idx) =>
    setVal(
      ws,
      deptHdrRow,
      idx + 1,
      h,
      'tableHeader',
      undefined,
      idx >= 4 && idx <= 8 && idx !== 6 ? 'right' : idx === 3 || idx === 6 ? 'center' : 'left',
    ),
  );

  const departments: Array<[string, string, string, boolean, number, boolean, number, string]> = [
    ['PROD', 'Produkcja', '#3987e5', true, 14, true, 55, 'Założenie robocze'],
    ['LOG', 'Logistyka i magazyn', '#d95926', true, 4, true, 25, ''],
    ['MKT', 'Marketing', '#199e70', true, 2, true, 0, ''],
    ['SPRZ', 'Sprzedaż', '#c98500', true, 3, true, 0, ''],
    ['ADM', 'Administracja i zarząd', '#d55181', true, 2, true, 20, ''],
    ['FIN', 'Finansowanie', '#9085e9', false, 0, false, 0, 'Dział finansowy bez etatów i powierzchni'],
  ];

  const deptStart = 6;
  const deptEnd = deptStart + departments.length - 1;
  reg.ranges.deptStart = deptStart;
  reg.ranges.deptEnd = deptEnd;

  departments.forEach(([code, name, color, hasHc, hc, hasRn, rn, note], idx) => {
    const r = deptStart + idx;
    reg.allocDept[code] = r;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, name, 'text', undefined, 'left');
    setVal(ws, r, 3, color, 'tech', undefined, 'left');
    setVal(ws, r, 4, hasHc, 'input', undefined, 'center');
    setVal(ws, r, 5, hc, 'input', NUM_FMT.int, 'right');
    ws.getCell(r, 5).fill = FILLS.inputSoft;
    setFormula(
      ws,
      r,
      6,
      `IF(SUM(COL_DEPT_HEADCOUNT)=0,0,E${r}/SUM(COL_DEPT_HEADCOUNT))`,
      'formula',
      NUM_FMT.pct1,
      'right',
    );
    setVal(ws, r, 7, hasRn, 'input', undefined, 'center');
    setVal(ws, r, 8, rn, 'input', NUM_FMT.int, 'right');
    ws.getCell(r, 8).fill = FILLS.inputSoft;
    setFormula(
      ws,
      r,
      9,
      `IF(SUM(COL_DEPT_RENT_WEIGHT)=0,0,H${r}/SUM(COL_DEPT_RENT_WEIGHT))`,
      'formula',
      NUM_FMT.pct1,
      'right',
    );
    setVal(ws, r, 10, note, 'text', undefined, 'left');
  });

  const deptTotalRow = deptEnd + 1;
  setVal(ws, deptTotalRow, 2, 'Razem', 'subtotal', undefined, 'left');
  setFormula(ws, deptTotalRow, 5, `SUM(E${deptStart}:E${deptEnd})`, 'subtotal', NUM_FMT.int, 'right');
  setFormula(ws, deptTotalRow, 6, `SUM(F${deptStart}:F${deptEnd})`, 'subtotal', NUM_FMT.pct1, 'right');
  setFormula(ws, deptTotalRow, 8, `SUM(H${deptStart}:H${deptEnd})`, 'subtotal', NUM_FMT.int, 'right');
  setFormula(ws, deptTotalRow, 9, `SUM(I${deptStart}:I${deptEnd})`, 'subtotal', NUM_FMT.pct1, 'right');

  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, deptHdrRow, 10, deptEnd), 'TBL_DEPARTMENTS');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, deptStart, 1, deptEnd), 'COL_DEPT_CODE');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 5, deptStart, 5, deptEnd), 'COL_DEPT_HEADCOUNT');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 8, deptStart, 8, deptEnd), 'COL_DEPT_RENT_WEIGHT');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 9, deptStart, 9, deptEnd), 'COL_DEPT_RENT_SHARE');

  // Sekcja 2: TBL_COST_CATEGORIES
  const catSecRow = deptTotalRow + 2;
  const catHdrRow = catSecRow + 1;
  fillSectionRow(ws, catSecRow, '2. SŁOWNIK KATEGORII KOSZTÓW (TBL_COST_CATEGORIES)', 2, 4);
  ['CatCode', 'CatName', 'ShortName', 'SortOrder'].forEach((h, idx) =>
    setVal(ws, catHdrRow, idx + 1, h, 'tableHeader', undefined, idx === 3 ? 'right' : 'left'),
  );

  const categories: Array<[string, string, string, number]> = [
    ['MAT', 'Materiały (surowiec S)', 'Materiały', 10],
    ['PRZ', 'Przetwórstwo i podwykonawcy', 'Przetwórstwo', 20],
    ['LOG', 'Logistyka', 'Logistyka', 30],
    ['MKS', 'Marketing i sprzedaż', 'Marketing i sprzedaż', 40],
    ['PER', 'Personel (płace + ZUS)', 'Personel', 50],
    ['ADM', 'Lokal i administracja', 'Lokal i adm.', 60],
    ['AMO', 'Amortyzacja', 'Amortyzacja', 70],
    ['FIN', 'Koszty finansowe', 'Finansowe', 80],
  ];

  const catStart = catHdrRow + 1;
  categories.forEach(([code, name, short, sort], idx) => {
    const r = catStart + idx;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, name, 'text', undefined, 'left');
    setVal(ws, r, 3, short, 'text', undefined, 'left');
    setVal(ws, r, 4, sort, 'input', NUM_FMT.plainInt, 'right');
  });
  const catEnd = catStart + categories.length - 1;
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, catHdrRow, 4, catEnd), 'TBL_COST_CATEGORIES');

  // Sekcja 3: TBL_ALLOC_MATRIX
  const allocSecRow = catEnd + 2;
  const allocLabelRow = allocSecRow + 1;
  const allocHdrRow = allocLabelRow + 1;
  const helperStartCol = 19; // Col S..X: pomocnicza alokacja PLN Rok dla bez-CSE SUMIF (poza M1..M12 i Rok)
  fillSectionRow(ws, allocSecRow, '3. MACIERZ ALOKACJI: POZYCJA KOSZTOWA → DZIAŁ (TBL_ALLOC_MATRIX)', 2, 13);

  const allocHumanLabels = [
    'Kod',
    'Pozycja kosztowa',
    'Kategoria',
    'Typ',
    'Zasada alokacji',
    ...departments.map((d) => d[1]),
    'Suma',
    'Kontrola',
  ];
  allocHumanLabels.forEach((h, idx) =>
    setVal(
      ws,
      allocLabelRow,
      idx + 1,
      h,
      'tableHeader',
      undefined,
      idx >= 5 && idx <= 11 ? 'right' : idx === 12 ? 'center' : 'left',
    ),
  );

  const allocHeaders = [
    'LineCode',
    'LineName',
    'CatCode',
    'CostBehavior',
    'AllocRule',
    ...departments.map((d) => d[0]),
    'RowSum',
    'RowCheck',
  ];
  allocHeaders.forEach((h, idx) =>
    setVal(
      ws,
      allocHdrRow,
      idx + 1,
      h,
      'tech',
      undefined,
      idx >= 5 && idx <= 11 ? 'right' : idx === 12 ? 'center' : 'left',
    ),
  );
  // Nagłówki kolumn pomocniczych PLN Rok
  setVal(ws, allocSecRow, helperStartCol, 'POMOCNICZE: ALOKACJA ROCZNA (PLN) DLA SUMIF', 'section', undefined, 'left');
  for (let c = helperStartCol + 1; c < helperStartCol + departments.length; c++) {
    styleCell(ws.getCell(allocSecRow, c), 'section');
  }
  departments.forEach((d, idx) =>
    setVal(ws, allocHdrRow, helperStartCol + idx, `${d[0]}_PLN_ROK`, 'tech', undefined, 'right'),
  );

  const allocLines: Array<{
    code: string;
    name: string;
    cat: string;
    behavior: 'VARIABLE' | 'FIXED';
    rule: string;
    mode: 'DIRECT' | 'HEADCOUNT' | 'RENT';
    weights?: Record<string, number>;
  }> = [
    { code: 'COST_RAW', name: 'Surowiec S', cat: 'MAT', behavior: 'VARIABLE', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { PROD: 1 } },
    { code: 'COST_PROC', name: 'Przetworzenie i konfekcja', cat: 'PRZ', behavior: 'VARIABLE', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { PROD: 1 } },
    { code: 'COST_SUB', name: 'Podwykonawcy', cat: 'PRZ', behavior: 'VARIABLE', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { PROD: 1 } },
    { code: 'COST_LOG', name: 'Logistyka / fulfillment', cat: 'LOG', behavior: 'VARIABLE', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { LOG: 1 } },
    { code: 'COST_MKT', name: 'Marketing performance', cat: 'MKS', behavior: 'VARIABLE', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { MKT: 1 } },
    { code: 'COST_SALES_FIX', name: 'Koszty sprzedaży stałe', cat: 'MKS', behavior: 'FIXED', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { SPRZ: 1 } },
    { code: 'COST_WAGES', name: 'Wynagrodzenia brutto', cat: 'PER', behavior: 'FIXED', rule: 'wg obsady (Klucze)', mode: 'HEADCOUNT' },
    { code: 'COST_ZUS', name: 'Składki ZUS pracodawcy', cat: 'PER', behavior: 'FIXED', rule: 'wg obsady (Klucze)', mode: 'HEADCOUNT' },
    { code: 'COST_RENT', name: 'Najem', cat: 'ADM', behavior: 'FIXED', rule: 'wg podziału najmu (Klucze)', mode: 'RENT' },
    { code: 'COST_OTH_FIX', name: 'Pozostałe koszty stałe', cat: 'ADM', behavior: 'FIXED', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { ADM: 1 } },
    { code: 'COST_DEPR', name: 'Amortyzacja', cat: 'AMO', behavior: 'FIXED', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { PROD: 1 } },
    { code: 'COST_FIN', name: 'Koszty finansowe', cat: 'FIN', behavior: 'FIXED', rule: 'bezpośrednio do działu', mode: 'DIRECT', weights: { FIN: 1 } },
  ];

  const allocStart = allocHdrRow + 1;
  const allocEnd = allocStart + allocLines.length - 1;
  reg.ranges.allocStart = allocStart;
  reg.ranges.allocEnd = allocEnd;

  allocLines.forEach((line, idx) => {
    const r = allocStart + idx;
    reg.allocLine[line.code] = r;
    setVal(ws, r, 1, line.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, line.name, 'text', undefined, 'left');
    setVal(ws, r, 3, line.cat, 'tech', undefined, 'left');
    setVal(ws, r, 4, line.behavior, 'tech', undefined, 'left');
    setVal(ws, r, 5, line.rule, 'text', undefined, 'left');

    departments.forEach((d, di) => {
      const c = 6 + di;
      const cl = colLetter(c);
      if (line.mode === 'HEADCOUNT') {
        setFormula(
          ws,
          r,
          c,
          `INDEX($F$${deptStart}:$F$${deptEnd},MATCH(${cl}$${allocHdrRow},$A$${deptStart}:$A$${deptEnd},0))`,
          'formula',
          NUM_FMT.pct1,
          'right',
        );
      } else if (line.mode === 'RENT') {
        setFormula(
          ws,
          r,
          c,
          `INDEX($I$${deptStart}:$I$${deptEnd},MATCH(${cl}$${allocHdrRow},$A$${deptStart}:$A$${deptEnd},0))`,
          'formula',
          NUM_FMT.pct1,
          'right',
        );
      } else {
        setVal(ws, r, c, line.weights?.[d[0]] ?? 0, 'input', NUM_FMT.pct1, 'right');
      }
    });

    setFormula(ws, r, 12, `SUM(F${r}:K${r})`, 'formula', NUM_FMT.pct1, 'right');
    setFormula(ws, r, 13, `IF(ABS(L${r}-1)<=0.0001,"OK","BLAD")`, 'check', undefined, 'center');
  });

  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, allocHdrRow, 13, allocEnd), 'TBL_ALLOC_MATRIX');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 12, allocStart, 12, allocEnd), 'COL_ALLOC_ROW_SUMS');

  // Sekcja 4: TBL_COST_LINES_MONTHLY (wypełniane po zbudowaniu RZiS)
  const clSecRow = allocEnd + 2;
  const clHdrRow = clSecRow + 1;
  fillSectionRow(ws, clSecRow, '4. KOSZTY MIESIĘCZNE WG LINII Z RZIS (TBL_COST_LINES_MONTHLY)', 2, 17);
  ['LineCode', 'LineName', 'CatCode', 'CostBehavior', ...MONTHS_PL, 'Rok'].forEach((h, idx) =>
    setVal(ws, clHdrRow, idx + 1, h, 'tableHeader', undefined, idx >= 4 ? 'right' : 'left'),
  );
  const clStart = clHdrRow + 1;
  const clEnd = clStart + allocLines.length - 1;
  const clTotalRow = clEnd + 1;
  reg.ranges.costLinesStart = clStart;
  reg.ranges.costLinesEnd = clEnd;
  reg.ranges.costLinesTotalRow = clTotalRow;

  allocLines.forEach((line, idx) => {
    const r = clStart + idx;
    reg.costLineRow[line.code] = r;
    setVal(ws, r, 1, line.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, line.name, 'text', undefined, 'left');
    setVal(ws, r, 3, line.cat, 'tech', undefined, 'left');
    setVal(ws, r, 4, line.behavior, 'tech', undefined, 'left');
  });
  setVal(ws, clTotalRow, 2, 'Koszty razem (przed CIT)', 'total', undefined, 'left');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, clHdrRow, 17, clEnd), 'TBL_COST_LINES_MONTHLY');

  // Sekcja 5: TBL_DEPT_COSTS_MONTHLY
  const dcSecRow = clTotalRow + 2;
  const dcHdrRow = dcSecRow + 1;
  fillSectionRow(ws, dcSecRow, '5. KOSZTY WG DZIAŁÓW PO ALOKACJI (TBL_DEPT_COSTS_MONTHLY)', 2, 16);
  ['DeptCode', 'DeptName', ...MONTHS_PL, 'Rok', 'Udział'].forEach((h, idx) =>
    setVal(ws, dcHdrRow, idx + 1, h, 'tableHeader', undefined, idx >= 2 ? 'right' : 'left'),
  );
  const dcStart = dcHdrRow + 1;
  const dcEnd = dcStart + departments.length - 1;
  const dcAllocSumRow = dcEnd + 1;
  const dcRzisSumRow = dcEnd + 2;
  const dcDiffRow = dcEnd + 3;
  reg.ranges.deptCostsStart = dcStart;
  reg.ranges.deptCostsEnd = dcEnd;
  reg.ranges.allocDiffRow = dcDiffRow;

  departments.forEach((d, idx) => {
    const r = dcStart + idx;
    reg.deptCostRow[d[0]] = r;
    setVal(ws, r, 1, d[0], 'tech', undefined, 'left');
    setVal(ws, r, 2, d[1], 'text', undefined, 'left');
  });
  setVal(ws, dcAllocSumRow, 2, 'Koszty razem (po alokacji)', 'total', undefined, 'left');
  setVal(ws, dcRzisSumRow, 2, 'Koszty razem wg RZiS (przed CIT)', 'subtotal', undefined, 'left');
  setVal(ws, dcDiffRow, 2, 'Różnica alokacji (powinno być 0)', 'check', undefined, 'left');

  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, dcHdrRow, 16, dcEnd), 'TBL_DEPT_COSTS_MONTHLY');
  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 3, dcDiffRow, 15, dcDiffRow), 'ROW_ALLOC_DIFF');

  // Sekcja 6: TBL_DEPT_X_CAT_YEAR
  const matSecRow = dcDiffRow + 2;
  const matLabelRow = matSecRow + 1;
  const matHdrRow = matLabelRow + 1;
  const matrixCatStartCol = 3;
  fillSectionRow(ws, matSecRow, '6. MACIERZ ROCZNA: DZIAŁ × KATEGORIA (TBL_DEPT_X_CAT_YEAR)', 2, 11);
  ['Kod', 'Dział', ...categories.map((c) => c[2]), 'Razem'].forEach((h, idx) =>
    setVal(ws, matLabelRow, idx + 1, h, 'tableHeader', undefined, idx >= 2 ? 'right' : 'left'),
  );
  ['DeptCode', 'DeptName', ...categories.map((c) => c[0]), 'Razem'].forEach((h, idx) =>
    setVal(ws, matHdrRow, idx + 1, h, 'tech', undefined, idx >= 2 ? 'right' : 'left'),
  );
  const matStart = matHdrRow + 1;
  const matEnd = matStart + departments.length - 1;
  const matTotalRow = matEnd + 1;

  departments.forEach((d, di) => {
    const r = matStart + di;
    setVal(ws, r, 1, d[0], 'tech', undefined, 'left');
    setVal(ws, r, 2, d[1], 'text', undefined, 'left');
    categories.forEach((_, ci) => {
      const col = matrixCatStartCol + ci;
      const cl = colLetter(col);
      const helperColLetter = colLetter(helperStartCol + di);
      setFormula(
        ws,
        r,
        col,
        `SUMIF($C$${allocStart}:$C$${allocEnd},${cl}$${matHdrRow},$${helperColLetter}$${allocStart}:$${helperColLetter}$${allocEnd})`,
        'formula',
        NUM_FMT.pln,
        'right',
      );
    });
    setFormula(ws, r, 11, `SUM(C${r}:J${r})`, 'subtotal', NUM_FMT.pln, 'right');
  });
  setVal(ws, matTotalRow, 2, 'Razem', 'total', undefined, 'left');
  for (let col = 3; col <= 11; col++) {
    const cl = colLetter(col);
    setFormula(ws, matTotalRow, col, `SUM(${cl}${matStart}:${cl}${matEnd})`, 'total', NUM_FMT.pln, 'right');
  }

  wb.definedNames.add(rangeRef(SHEET_NAMES.ALLOCATION, 1, matHdrRow, 11, matEnd), 'TBL_DEPT_X_CAT_YEAR');

  ws.columns = [
    { width: 16 },
    { width: 34 },
    { width: 16 },
    { width: 14 },
    { width: 26 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 15 },
    { width: 15 },
    { width: 6 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
  ];

  polishWorksheetAppearance(ws, {
    tabColor: 'FF0284C7',
    hiddenCols: [1, 19, 20, 21, 22, 23, 24],
  });

  return {
    deptHdrRow,
    allocHdrRow,
    costLinesHdrRow: clHdrRow,
    deptCostsHdrRow: dcHdrRow,
    matrixCatStartCol,
    deptXCatHdrRow: matHdrRow,
    helperStartCol,
  };
}

function build03Operations(wb: ExcelJS.Workbook, reg: RowRegistry): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SHEET_NAMES.OPERATIONS);
  ws.views = [{ state: 'frozen', xSplit: 2, ySplit: 5 }];

  setVal(ws, 1, 2, 'BETA — Model operacyjny (12 miesięcy 2027, graf acykliczny DAG)', 'title', undefined, 'left');
  setVal(ws, 2, 2, 'Wszystkie kalkulacje operacyjne, kapitał obrotowy i kaskada płynności (kolumna A z kodami jest ukryta).', 'subtitle', undefined, 'left');

  // Wiersz 3: Nagłówki (D3:O3 = META_PERIOD_HEADERS)
  ['LINE_CODE', 'Pozycja', 'Moment zero', ...PERIOD_ISO, 'Rok'].forEach((h, idx) => {
    const col = idx + 1;
    setVal(ws, 3, col, h, col === 1 ? 'tech' : 'tableHeader', undefined, col <= 2 ? 'left' : 'right');
  });
  wb.definedNames.add(rangeRef(SHEET_NAMES.OPERATIONS, 4, 3, 15, 3), 'META_PERIOD_HEADERS');

  // Wiersz 4: Nr miesiąca, Wiersz 5: Kwartał
  setVal(ws, 4, 1, 'META_MONTH_NO', 'tech', undefined, 'left');
  setVal(ws, 4, 2, 'Nr miesiąca', 'text', undefined, 'left');
  setVal(ws, 5, 1, 'META_QUARTER_NO', 'tech', undefined, 'left');
  setVal(ws, 5, 2, 'Kwartał', 'text', undefined, 'left');
  for (let m = 1; m <= 12; m++) {
    const col = 3 + m;
    setVal(ws, 4, col, m, 'input', NUM_FMT.plainInt, 'right');
    setVal(ws, 5, col, Math.ceil(m / 3), 'input', NUM_FMT.plainInt, 'right');
  }

  let row = 7;
  const opSec = (title: string) => {
    fillSectionRow(ws, row, title, 2, 16);
    row++;
  };

  interface OpRowOpts {
    code: string;
    label: string;
    fmt: string;
    role?: CellRole;
    zeroFormula?: string;
    monthFormula: (m: number, col: string, prevCol: string, r: number) => string;
    yearFormula?: (r: number) => string | null;
  }

  const addOpRow = (opts: OpRowOpts): number => {
    const r = row++;
    reg.op[opts.code] = r;
    const role = opts.role ?? 'formula';
    setVal(ws, r, 1, opts.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, opts.label, role === 'subtotal' || role === 'total' ? role : 'text', undefined, 'left');
    if (opts.zeroFormula) {
      setFormula(ws, r, 3, opts.zeroFormula, 'link', opts.fmt, 'right');
      ws.getCell(r, 3).fill = FILLS.zeroCol;
    } else {
      styleCell(ws.getCell(r, 3), 'text', undefined, 'right');
    }
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(3 + m);
      const prevCol = colLetter(2 + m);
      setFormula(ws, r, 3 + m, opts.monthFormula(m, col, prevCol, r), role, opts.fmt, 'right');
    }
    const yf = opts.yearFormula ? opts.yearFormula(r) : `SUM(D${r}:O${r})`;
    if (yf) {
      setFormula(ws, r, 16, yf, role === 'total' ? 'total' : 'subtotal', opts.fmt, 'right');
    } else {
      styleCell(ws.getCell(r, 16), 'text', undefined, 'right');
    }
    return r;
  };

  // 1. SPRZEDAŻ
  opSec('1. SPRZEDAŻ');
  const rShare = addOpRow({
    code: 'OP_SEASON_SHARE',
    label: 'Udział miesiąca w sprzedaży rocznej',
    fmt: NUM_FMT.pct2,
    monthFormula: (_m, col) => `IF(${col}$5=4,CFG_Q4_SHARE/3,(1-CFG_Q4_SHARE)/9)`,
  });
  const rVolX = addOpRow({
    code: 'OP_VOL_X',
    label: 'Wolumen X (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) =>
      `IF(INDEX(COL_PROD_ACTIVE,MATCH("PROD_X",COL_PROD_CODE,0)),INDEX(COL_PROD_VOL,MATCH("PROD_X",COL_PROD_CODE,0))*${col}$${rShare}*(1+SIM_VOL_DELTA),0)`,
  });
  const rVolY = addOpRow({
    code: 'OP_VOL_Y',
    label: 'Wolumen Y (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) =>
      `IF(INDEX(COL_PROD_ACTIVE,MATCH("PROD_Y",COL_PROD_CODE,0)),INDEX(COL_PROD_VOL,MATCH("PROD_Y",COL_PROD_CODE,0))*${col}$${rShare}*(1+SIM_VOL_DELTA),0)`,
  });
  const rVolZ = addOpRow({
    code: 'OP_VOL_Z',
    label: 'Wolumen Z (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) =>
      `IF(INDEX(COL_PROD_ACTIVE,MATCH("PROD_Z",COL_PROD_CODE,0)),INDEX(COL_PROD_VOL,MATCH("PROD_Z",COL_PROD_CODE,0))*${col}$${rShare}*(1+SIM_VOL_DELTA),0)`,
  });
  const rVolTot = addOpRow({
    code: 'OP_VOL_TOTAL',
    label: 'Wolumen razem (kg)',
    fmt: NUM_FMT.int,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rVolX}+${col}${rVolY}+${col}${rVolZ}`,
  });
  const rRevX = addOpRow({
    code: 'OP_REV_X',
    label: 'Przychód X',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `${col}${rVolX}*INDEX(COL_PROD_PRICE,MATCH("PROD_X",COL_PROD_CODE,0))*(1+SIM_PRICE_DELTA)`,
  });
  const rRevY = addOpRow({
    code: 'OP_REV_Y',
    label: 'Przychód Y',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `${col}${rVolY}*INDEX(COL_PROD_PRICE,MATCH("PROD_Y",COL_PROD_CODE,0))*(1+SIM_PRICE_DELTA)`,
  });
  const rRevZ = addOpRow({
    code: 'OP_REV_Z',
    label: 'Przychód Z',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `${col}${rVolZ}*INDEX(COL_PROD_PRICE,MATCH("PROD_Z",COL_PROD_CODE,0))*(1+SIM_PRICE_DELTA)`,
  });
  const rRevTot = addOpRow({
    code: 'OP_REV_TOTAL',
    label: 'Przychody razem',
    fmt: NUM_FMT.pln,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rRevX}+${col}${rRevY}+${col}${rRevZ}`,
  });
  const rRevOnl = addOpRow({
    code: 'OP_REV_ONLINE',
    label: 'w tym online',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `${col}${rRevTot}*CFG_ONLINE_SHARE`,
  });
  const rRevB2b = addOpRow({
    code: 'OP_REV_B2B',
    label: 'w tym B2B / hurt',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `${col}${rRevTot}*(1-CFG_ONLINE_SHARE)`,
  });

  // 2. SUROWIEC S I ZAPASY
  row++;
  opSec('2. SUROWIEC S I ZAPASY');
  const rRawPrice = addOpRow({
    code: 'OP_RAW_PURCH_PRICE',
    label: 'Cena surowca w miesiącu zakupu (PLN/kg)',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `INDEX(TBL_RAW_PRICES_Q,${col}$5,1)*(1+SIM_RAW_PRICE_DELTA)`,
    yearFormula: () => null,
  });
  const rVolPlus2 = addOpRow({
    code: 'OP_VOL_PLUS_2M',
    label: 'Wolumen sprzedaży za 2 miesiące (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) => `INDEX($D$${rVolTot}:$O$${rVolTot},1,MOD(${col}$4+1,12)+1)`,
    yearFormula: () => null,
  });
  const rRawPurchKg = addOpRow({
    code: 'OP_RAW_PURCH_KG',
    label: 'Zakup surowca (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) => `${col}${rVolPlus2}*CFG_RAW_USAGE`,
  });
  const rRawPurchVal = addOpRow({
    code: 'OP_RAW_PURCH_VAL',
    label: 'Zakup surowca (wartość)',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_AP_RAW',
    monthFormula: (_m, col) => `${col}${rRawPurchKg}*${col}${rRawPrice}`,
  });
  const rRawBatchPrice = addOpRow({
    code: 'OP_RAW_BATCH_PRICE',
    label: 'Cena zakupu partii sprzedawanej w miesiącu (t-2)',
    fmt: NUM_FMT.pln2,
    monthFormula: (m) =>
      m <= 2 ? 'CFG_RAW_PRICE_PREV' : `${colLetter(3 + m - 2)}${rRawPrice}`,
    yearFormula: () => null,
  });
  const rRawUseKg = addOpRow({
    code: 'OP_RAW_USE_KG',
    label: 'Zużycie surowca w sprzedaży (kg)',
    fmt: NUM_FMT.int,
    monthFormula: (_m, col) => `${col}${rVolTot}*CFG_RAW_USAGE`,
  });
  const rRawCogs = addOpRow({
    code: 'OP_RAW_COGS',
    label: 'Koszt surowca sprzedanych produktów',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rRawUseKg}*${col}${rRawBatchPrice}`,
  });
  const rInvSafety = addOpRow({
    code: 'OP_INV_SAFETY',
    label: 'Zapas bezpieczeństwa surowca',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_INV_SAFETY',
    monthFormula: () => 'CFG_SAFETY_STOCK',
    yearFormula: () => null,
  });
  const rInvRaw = addOpRow({
    code: 'OP_INV_RAW',
    label: 'Surowiec zakupiony, jeszcze niesprzedany',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_INV_RAW',
    monthFormula: (_m, col, prevCol, r) => `${prevCol}${r}+${col}${rRawPurchVal}-${col}${rRawCogs}`,
    yearFormula: () => null,
  });
  const rInvOther = addOpRow({
    code: 'OP_INV_OTHER',
    label: 'Pozostałe zapasy (stałe)',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_INV_OTHER',
    monthFormula: (_m, _col, prevCol, r) => `${prevCol}${r}`,
    yearFormula: () => null,
  });
  const rInvTot = addOpRow({
    code: 'OP_INV_TOTAL',
    label: 'Zapasy razem',
    fmt: NUM_FMT.pln,
    role: 'total',
    zeroFormula: 'BO_INV_TOTAL',
    monthFormula: (_m, col) => `${col}${rInvSafety}+${col}${rInvRaw}+${col}${rInvOther}`,
    yearFormula: () => null,
  });

  // 3. KOSZTY OPERACYJNE I DOTACJA
  row++;
  opSec('3. KOSZTY OPERACYJNE I DOTACJA UE');
  addOpRow({
    code: 'OP_COST_PROC',
    label: 'Koszt przetworzenia i konfekcji',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `${col}${rVolTot}*CFG_PROC_COST*(1+SIM_PROC_DELTA)`,
  });
  addOpRow({
    code: 'OP_COST_LOG',
    label: 'Logistyka / fulfillment',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `${col}${rVolTot}*(CFG_EXPORT_SHARE*CFG_LOG_EXPORT+(1-CFG_EXPORT_SHARE)*CFG_LOG_DOMESTIC)*(1+SIM_LOG_DELTA)`,
  });
  addOpRow({
    code: 'OP_COST_MKT',
    label: 'Marketing performance',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `${col}${rRevTot}*CFG_MKT_PERF_RATE*(1+SIM_MKT_DELTA)`,
  });
  addOpRow({
    code: 'OP_COST_SUB',
    label: 'Podwykonawcy',
    fmt: NUM_FMT.pln,
    monthFormula: () => `$P$${rRevTot}*CFG_SUBCONTRACT_RATE/12`,
  });
  const rWages = addOpRow({
    code: 'OP_COST_WAGES',
    label: 'Wynagrodzenia brutto',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_HEADCOUNT_TOTAL*CFG_AVG_WAGE*(1+SIM_WAGE_DELTA)',
  });
  addOpRow({
    code: 'OP_COST_ZUS',
    label: 'Składki ZUS pracodawcy',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `${col}${rWages}*CFG_ZUS_RATE`,
  });
  addOpRow({
    code: 'OP_COST_RENT',
    label: 'Najem',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_RENT_MONTHLY*(1+SIM_RENT_DELTA)',
  });
  addOpRow({
    code: 'OP_COST_SALES_FIX',
    label: 'Koszty sprzedaży stałe',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_SALES_FIXED_MONTHLY',
  });
  addOpRow({
    code: 'OP_COST_OTH_FIX',
    label: 'Pozostałe koszty stałe',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_OTHER_FIXED_MONTHLY*(1+SIM_OTH_FIX_DELTA)',
  });
  const rGrant = addOpRow({
    code: 'OP_GRANT_RELEASE',
    label: 'Rozliczenie dotacji UE (przychód)',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_GRANT_MONTHLY',
  });

  // 4. ŚRODKI TRWAŁE
  row++;
  opSec('4. ŚRODKI TRWAŁE');
  const rCapex = addOpRow({
    code: 'OP_CAPEX',
    label: 'Nakłady inwestycyjne',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `IF(${col}$4=CFG_CAPEX_MONTH,CFG_CAPEX_AMOUNT,0)`,
  });
  const rDepOld = addOpRow({
    code: 'OP_DEPR_OLD',
    label: 'Amortyzacja – istniejące aktywa',
    fmt: NUM_FMT.pln,
    monthFormula: () => 'CFG_EXISTING_DEPR_ANNUAL/12',
  });
  const rDepNew = addOpRow({
    code: 'OP_DEPR_NEW',
    label: 'Amortyzacja – nowa linia',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `IF(${col}$4>CFG_CAPEX_MONTH,CFG_CAPEX_AMOUNT*CFG_NEW_LINE_DEPR_RATE/12,0)`,
  });
  const rDepTot = addOpRow({
    code: 'OP_DEPR_TOTAL',
    label: 'Amortyzacja razem',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rDepOld}+${col}${rDepNew}`,
  });
  addOpRow({
    code: 'OP_FA_NET',
    label: 'Aktywa trwałe netto',
    fmt: NUM_FMT.pln,
    role: 'total',
    zeroFormula: 'BO_FA_NET',
    monthFormula: (_m, col, prevCol, r) => `${prevCol}${r}+${col}${rCapex}-${col}${rDepTot}`,
    yearFormula: () => null,
  });

  // 5. KREDYT INWESTYCYJNY
  row++;
  opSec('5. KREDYT INWESTYCYJNY');
  const rLoanOpen = addOpRow({
    code: 'OP_LOAN_OPEN',
    label: 'Saldo na początek',
    fmt: NUM_FMT.pln,
    monthFormula: () => '0', // nadpisane poniżej po alokacji rLoanEnd
    yearFormula: () => null,
  });
  const rLoanDisb = addOpRow({
    code: 'OP_LOAN_DISB',
    label: 'Uruchomienie',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `IF(${col}$4=CFG_CAPEX_MONTH,CFG_LOAN_AMOUNT,0)`,
  });
  const rLoanRep = addOpRow({
    code: 'OP_LOAN_REP',
    label: 'Spłata kapitału',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) =>
      `IF(CFG_LOAN_INSTALLMENTS<=0,0,IF(AND(${col}$4>=CFG_LOAN_FIRST_REP_MONTH,MOD(${col}$4-CFG_LOAN_FIRST_REP_MONTH,CFG_LOAN_REP_FREQ)=0),MIN(${col}${rLoanOpen}+${col}${rLoanDisb},CFG_LOAN_AMOUNT/CFG_LOAN_INSTALLMENTS),0))`,
  });
  const rLoanEnd = addOpRow({
    code: 'OP_LOAN_END',
    label: 'Saldo na koniec',
    fmt: NUM_FMT.pln,
    role: 'total',
    zeroFormula: 'BO_LOAN',
    monthFormula: (_m, col) => `${col}${rLoanOpen}+${col}${rLoanDisb}-${col}${rLoanRep}`,
    yearFormula: () => null,
  });
  // Uzupełnij dokładnie odwołanie OP_LOAN_OPEN -> prev OP_LOAN_END
  for (let m = 1; m <= 12; m++) {
    setFormula(ws, rLoanOpen, 3 + m, `${colLetter(2 + m)}${rLoanEnd}`, 'formula', NUM_FMT.pln, 'right');
  }
  const rLoanRate = addOpRow({
    code: 'OP_LOAN_RATE',
    label: 'Oprocentowanie roczne (WIBOR 3M + marża)',
    fmt: NUM_FMT.pct2,
    monthFormula: () => 'CFG_WIBOR_3M+CFG_LOAN_MARGIN',
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_LOAN_INT',
    label: 'Odsetki od kredytu inwestycyjnego',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rLoanOpen}*${col}${rLoanRate}/12`,
  });
  addOpRow({
    code: 'OP_LOAN_FEE',
    label: 'Prowizja przygotowawcza',
    fmt: NUM_FMT.pln,
    monthFormula: (_m, col) => `IF(${col}$4=CFG_CAPEX_MONTH,CFG_LOAN_AMOUNT*CFG_LOAN_FEE_RATE,0)`,
  });

  // 6. KAPITAŁ OBROTOWY
  row++;
  opSec('6. KAPITAŁ OBROTOWY');
  const rArOnl = addOpRow({
    code: 'OP_AR_ONLINE',
    label: 'Należności online',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_AR_ONLINE',
    monthFormula: (_m, col) => `${col}${rRevOnl}*CFG_DSO_ONLINE/CFG_DAYS_IN_MONTH`,
    yearFormula: () => null,
  });
  const rArB2b = addOpRow({
    code: 'OP_AR_B2B',
    label: 'Należności B2B / hurt',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_AR_B2B',
    monthFormula: (m, col, _prevCol, r) => {
      if (m === 1) return `${col}${rRevB2b}+2*$C$${r}/3`;
      if (m === 2) return `${col}${rRevB2b}+${colLetter(3 + m - 1)}${rRevB2b}+$C$${r}/3`;
      return `${col}${rRevB2b}+${colLetter(3 + m - 1)}${rRevB2b}+${colLetter(3 + m - 2)}${rRevB2b}`;
    },
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_AR_TOTAL',
    label: 'Należności handlowe razem',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    zeroFormula: 'BO_AR_TOTAL',
    monthFormula: (_m, col) => `${col}${rArOnl}+${col}${rArB2b}`,
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_OTHER_AR',
    label: 'Pozostałe należności',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_OTHER_AR',
    monthFormula: (_m, _col, prevCol, r) => `${prevCol}${r}`,
    yearFormula: () => null,
  });
  const rApRaw = addOpRow({
    code: 'OP_AP_RAW',
    label: 'Zobowiązania wobec dostawców surowca',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_AP_RAW',
    monthFormula: (_m, col) => `${col}${rRawPurchVal}`,
    yearFormula: () => null,
  });
  const rApOth = addOpRow({
    code: 'OP_AP_OTHER',
    label: 'Pozostałe zobowiązania handlowe (stałe)',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_AP_OTHER',
    monthFormula: (_m, _col, prevCol, r) => `${prevCol}${r}`,
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_AP_TOTAL',
    label: 'Zobowiązania handlowe razem',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    zeroFormula: 'BO_AP_TOTAL',
    monthFormula: (_m, col) => `${col}${rApRaw}+${col}${rApOth}`,
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_DEFERRED_GRANT',
    label: 'Rozliczenia międzyokresowe bierne (dotacja)',
    fmt: NUM_FMT.pln,
    zeroFormula: 'BO_DEFERRED_GRANT',
    monthFormula: (_m, col, prevCol, r) => `MAX(0,${prevCol}${r}-${col}${rGrant})`,
    yearFormula: () => null,
  });

  // 7. PŁYNNOŚĆ I FINANSOWANIE (KASKADA DAG)
  row++;
  opSec('7. PŁYNNOŚĆ I FINANSOWANIE BIEŻĄCE (CASH SWEEP)');
  const rOvOpen = addOpRow({
    code: 'OP_OV_OPEN',
    label: 'Overdraft – saldo na początek',
    fmt: NUM_FMT.pln2,
    monthFormula: () => '0', // nadpiszemy poniżej po alokacji rOvEnd
    yearFormula: () => null,
  });
  const rSlOpen = addOpRow({
    code: 'OP_SL_OPEN',
    label: 'Pożyczka wspólników – saldo na początek',
    fmt: NUM_FMT.pln2,
    monthFormula: () => '0', // nadpiszemy poniżej po alokacji rSlEnd
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_OV_INT',
    label: 'Odsetki od overdraftu',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rOvOpen}*(CFG_WIBOR_1M+CFG_OV_MARGIN)/12`,
  });
  addOpRow({
    code: 'OP_SL_INT',
    label: 'Odsetki od pożyczki wspólników',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rSlOpen}*(CFG_WIBOR_3M+CFG_SH_LOAN_MARGIN)/12`,
  });
  const rCashOpen = addOpRow({
    code: 'OP_CASH_OPEN',
    label: 'Gotówka na początek miesiąca',
    fmt: NUM_FMT.pln2,
    monthFormula: () => '0', // nadpiszemy poniżej po alokacji rCashEnd
    yearFormula: () => null,
  });
  const rCfoLink = addOpRow({
    code: 'OP_CFO_LINK',
    label: 'Przepływy operacyjne (z CF)',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: () => '0', // uzupełniane po 06_CashFlow
    yearFormula: () => null,
  });
  const rCfiLink = addOpRow({
    code: 'OP_CFI_LINK',
    label: 'Przepływy inwestycyjne (z CF)',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: () => '0', // uzupełniane po 06_CashFlow
    yearFormula: () => null,
  });
  const rLoanNet = addOpRow({
    code: 'OP_LOAN_NET',
    label: 'Kredyt inwestycyjny netto (uruchomienie – spłata)',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rLoanDisb}-${col}${rLoanRep}`,
    yearFormula: () => null,
  });
  const rCashBefore = addOpRow({
    code: 'OP_CASH_BEFORE',
    label: 'Gotówka przed finansowaniem bieżącym',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rCashOpen}+${col}${rCfoLink}+${col}${rCfiLink}+${col}${rLoanNet}`,
    yearFormula: () => null,
  });
  const rOvEnd = addOpRow({
    code: 'OP_OV_END',
    label: 'Overdraft – saldo na koniec (limit i min. gotówka)',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    zeroFormula: 'BO_OVERDRAFT',
    monthFormula: (_m, col) =>
      `MIN(MAX(${col}${rOvOpen}+CFG_MIN_CASH-${col}${rCashBefore},0),CFG_OV_LIMIT)`,
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_OV_DELTA',
    label: 'Zmiana overdraftu',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rOvEnd}-${col}${rOvOpen}`,
    yearFormula: () => null,
  });
  const rCashAfterOv = addOpRow({
    code: 'OP_CASH_AFTER_OV',
    label: 'Gotówka po overdrafcie',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rCashBefore}+(${col}${rOvEnd}-${col}${rOvOpen})`,
    yearFormula: () => null,
  });
  const rShortage = addOpRow({
    code: 'OP_CASH_SHORTAGE',
    label: 'Niedobór gotówki po wyczerpaniu limitu overdraftu',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `MAX(0,CFG_MIN_CASH-${col}${rCashAfterOv})`,
    yearFormula: () => null,
  });
  const rSlDisb = addOpRow({
    code: 'OP_SL_DISB',
    label: 'Pożyczka wspólników – uruchomienie',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `${col}${rShortage}`,
  });
  const rSlRep = addOpRow({
    code: 'OP_SL_REP',
    label: 'Pożyczka wspólników – spłata',
    fmt: NUM_FMT.pln2,
    monthFormula: (_m, col) => `MIN(${col}${rSlOpen},MAX(0,${col}${rCashAfterOv}-CFG_MIN_CASH))`,
  });
  const rSlEnd = addOpRow({
    code: 'OP_SL_END',
    label: 'Pożyczka wspólników – saldo na koniec',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    zeroFormula: 'BO_SH_LOAN',
    monthFormula: (_m, col) => `${col}${rSlOpen}+${col}${rSlDisb}-${col}${rSlRep}`,
    yearFormula: () => null,
  });
  const rCashEnd = addOpRow({
    code: 'OP_CASH_END',
    label: 'Gotówka na koniec miesiąca',
    fmt: NUM_FMT.pln2,
    role: 'total',
    zeroFormula: 'BO_CASH',
    monthFormula: (_m, col) => `${col}${rCashAfterOv}+${col}${rSlDisb}-${col}${rSlRep}`,
    yearFormula: () => null,
  });
  addOpRow({
    code: 'OP_OV_FREE_LIMIT',
    label: 'Wolny limit overdraftu',
    fmt: NUM_FMT.pln2,
    zeroFormula: 'CFG_OV_LIMIT-BO_OVERDRAFT',
    monthFormula: (_m, col) => `CFG_OV_LIMIT-${col}${rOvEnd}`,
    yearFormula: () => null,
  });

  // Domknięcie referencji t-1 dla OV_OPEN, SL_OPEN, CASH_OPEN
  for (let m = 1; m <= 12; m++) {
    const prev = colLetter(2 + m);
    setFormula(ws, rOvOpen, 3 + m, `${prev}${rOvEnd}`, 'formula', NUM_FMT.pln2, 'right');
    setFormula(ws, rSlOpen, 3 + m, `${prev}${rSlEnd}`, 'formula', NUM_FMT.pln2, 'right');
    setFormula(ws, rCashOpen, 3 + m, `${prev}${rCashEnd}`, 'formula', NUM_FMT.pln2, 'right');
  }

  wb.definedNames.add(rangeRef(SHEET_NAMES.OPERATIONS, 4, rOvEnd, 15, rOvEnd), 'ROW_OV_END');
  wb.definedNames.add(rangeRef(SHEET_NAMES.OPERATIONS, 4, rSlEnd, 15, rSlEnd), 'ROW_SL_END');

  ws.columns = [
    { width: 22 },
    { width: 46 },
    { width: 15 },
    ...Array.from({ length: 12 }, () => ({ width: 14 })),
    { width: 16 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF475569', hiddenCols: [1] });

  return ws;
}

function build04PL(wb: ExcelJS.Workbook, reg: RowRegistry): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SHEET_NAMES.PL);
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 4 }];

  setVal(ws, 1, 5, 'BETA — Rachunek zysków i strat (PLN netto)', 'title', undefined, 'left');
  setVal(ws, 2, 5, 'Koszty prezentowane jako wartości dodatnie; kolumny A:D stanowią metadane kontraktu UI.', 'subtitle', undefined, 'left');

  const hdrRow = 4;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', ...MONTHS_PL, 'Rok'].forEach((h, idx) =>
    setVal(ws, hdrRow, idx + 1, h, idx < 4 ? 'tech' : 'tableHeader', undefined, idx >= 5 ? 'right' : 'left'),
  );

  let row = 5;
  const addPlRow = (opts: {
    code: string;
    rowType: string;
    aggMode: string;
    wfRole: string;
    label: string;
    fmt: string;
    role: CellRole;
    monthFormula: (m: number, col: string) => string;
    yearFormula?: (r: number) => string;
  }): number => {
    const r = row++;
    reg.pl[opts.code] = r;
    setVal(ws, r, 1, opts.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, opts.rowType, 'tech', undefined, 'left');
    setVal(ws, r, 3, opts.aggMode, 'tech', undefined, 'left');
    setVal(ws, r, 4, opts.wfRole, 'tech', undefined, 'left');
    setVal(
      ws,
      r,
      5,
      opts.label,
      opts.role === 'subtotal' || opts.role === 'total' || opts.role === 'pct' ? opts.role : 'text',
      undefined,
      'left',
    );
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(5 + m);
      setFormula(ws, r, 5 + m, opts.monthFormula(m, col), opts.role, opts.fmt, 'right');
    }
    const yf = opts.yearFormula ? opts.yearFormula(r) : `SUM(F${r}:Q${r})`;
    setFormula(
      ws,
      r,
      18,
      yf,
      opts.role === 'total' ? 'total' : opts.role === 'pct' ? 'pct' : 'subtotal',
      opts.fmt,
      'right',
    );
    return r;
  };

  const opLink = (opCode: string, plCol: string) => {
    const mIdx = plCol.charCodeAt(0) - 'F'.charCodeAt(0); // 0..11
    const opCol = colLetter(4 + mIdx); // D..O
    return qRef(SHEET_NAMES.OPERATIONS, `${opCol}${reg.op[opCode]}`);
  };

  const rX = addPlRow({
    code: 'PL_REV_PROD_X',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Przychody – produkt X',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_REV_X', col),
  });
  const rY = addPlRow({
    code: 'PL_REV_PROD_Y',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Przychody – produkt Y',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_REV_Y', col),
  });
  const rZ = addPlRow({
    code: 'PL_REV_PROD_Z',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Przychody – produkt Z',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_REV_Z', col),
  });
  const rRev = addPlRow({
    code: 'PL_REV_TOTAL',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    wfRole: 'START',
    label: 'Przychody ze sprzedaży',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    monthFormula: (_m, col) => `SUM(${col}${rX}:${col}${rZ})`,
  });

  const rRaw = addPlRow({
    code: 'PL_COGS_RAW',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Koszt surowca S',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_RAW_COGS', col),
  });
  const rProc = addPlRow({
    code: 'PL_VAR_PROC',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Koszt przetworzenia i konfekcji',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_PROC', col),
  });
  const rLog = addPlRow({
    code: 'PL_VAR_LOG',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Logistyka / fulfillment',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_LOG', col),
  });
  const rMkt = addPlRow({
    code: 'PL_VAR_MKT',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Marketing performance',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_MKT', col),
  });
  const rSub = addPlRow({
    code: 'PL_VAR_SUB',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Podwykonawcy',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_SUB', col),
  });
  const rVarTot = addPlRow({
    code: 'PL_VAR_TOTAL',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Koszty zmienne razem',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    monthFormula: (_m, col) => `SUM(${col}${rRaw}:${col}${rSub})`,
  });
  const rCm = addPlRow({
    code: 'PL_CONTRIB_MARGIN',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    wfRole: 'SUBTOTAL',
    label: 'Marża po kosztach zmiennych',
    fmt: NUM_FMT.pln,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rRev}-${col}${rVarTot}`,
  });
  addPlRow({
    code: 'PL_CONTRIB_MARGIN_PCT',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    wfRole: 'NONE',
    label: '% przychodów (Marża zmienna)',
    fmt: NUM_FMT.pct1,
    role: 'pct',
    monthFormula: (_m, col) => `IF(${col}${rRev}=0,0,${col}${rCm}/${col}${rRev})`,
    yearFormula: () => `IF(R${rRev}=0,0,R${rCm}/R${rRev})`,
  });

  const rWages = addPlRow({
    code: 'PL_FIX_WAGES',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Wynagrodzenia brutto',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_WAGES', col),
  });
  const rZus = addPlRow({
    code: 'PL_FIX_ZUS',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Składki ZUS pracodawcy',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_ZUS', col),
  });
  const rRent = addPlRow({
    code: 'PL_FIX_RENT',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Najem',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_RENT', col),
  });
  const rSalesFix = addPlRow({
    code: 'PL_FIX_SALES',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Koszty sprzedaży stałe',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_SALES_FIX', col),
  });
  const rOthFix = addPlRow({
    code: 'PL_FIX_OTHER',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Pozostałe koszty stałe',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_COST_OTH_FIX', col),
  });
  const rFixTot = addPlRow({
    code: 'PL_FIX_TOTAL',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Koszty stałe razem',
    fmt: NUM_FMT.pln,
    role: 'subtotal',
    monthFormula: (_m, col) => `SUM(${col}${rWages}:${col}${rOthFix})`,
  });
  const rGrant = addPlRow({
    code: 'PL_GRANT_RELEASE',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_POS',
    label: 'Rozliczenie dotacji UE',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_GRANT_RELEASE', col),
  });
  const rEbitda = addPlRow({
    code: 'PL_EBITDA',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    wfRole: 'SUBTOTAL',
    label: 'EBITDA',
    fmt: NUM_FMT.pln,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rCm}-${col}${rFixTot}+${col}${rGrant}`,
  });
  addPlRow({
    code: 'PL_EBITDA_PCT',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    wfRole: 'NONE',
    label: '% przychodów (EBITDA)',
    fmt: NUM_FMT.pct1,
    role: 'pct',
    monthFormula: (_m, col) => `IF(${col}${rRev}=0,0,${col}${rEbitda}/${col}${rRev})`,
    yearFormula: () => `IF(R${rRev}=0,0,R${rEbitda}/R${rRev})`,
  });

  const rDepr = addPlRow({
    code: 'PL_DEPR',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Amortyzacja',
    fmt: NUM_FMT.pln,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_DEPR_TOTAL', col),
  });
  const rEbit = addPlRow({
    code: 'PL_EBIT',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    wfRole: 'SUBTOTAL',
    label: 'EBIT',
    fmt: NUM_FMT.pln,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rEbitda}-${col}${rDepr}`,
  });

  const rIntLoan = addPlRow({
    code: 'PL_FIN_INT_LOAN',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Odsetki od kredytu inwestycyjnego',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_LOAN_INT', col),
  });
  const rFee = addPlRow({
    code: 'PL_FIN_FEE',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Prowizja przygotowawcza',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_LOAN_FEE', col),
  });
  const rIntOv = addPlRow({
    code: 'PL_FIN_INT_OV',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Odsetki od overdraftu',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_OV_INT', col),
  });
  const rIntSl = addPlRow({
    code: 'PL_FIN_INT_SH_LOAN',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Odsetki od pożyczki wspólników',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (_m, col) => opLink('OP_SL_INT', col),
  });
  const rFinTot = addPlRow({
    code: 'PL_FIN_TOTAL',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Koszty finansowe razem',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    monthFormula: (_m, col) => `SUM(${col}${rIntLoan}:${col}${rIntSl})`,
  });
  const rEbt = addPlRow({
    code: 'PL_EBT',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    wfRole: 'NONE',
    label: 'Wynik brutto (EBT)',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rEbit}-${col}${rFinTot}`,
  });
  const rCit = addPlRow({
    code: 'PL_CIT',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    wfRole: 'DELTA_NEG',
    label: 'Podatek dochodowy (CIT)',
    fmt: NUM_FMT.pln2,
    role: 'formula',
    monthFormula: (m, col) => {
      if (m === 1) return `MAX(0,CFG_CIT*${col}${rEbt})`;
      const prevCol = colLetter(5 + m - 1);
      return `MAX(0,CFG_CIT*SUM($F${rEbt}:${col}${rEbt}))-SUM($F${rEbt + 1}:${prevCol}${rEbt + 1})`;
    },
  });
  const rNet = addPlRow({
    code: 'PL_NET_INCOME',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    wfRole: 'END',
    label: 'Wynik netto',
    fmt: NUM_FMT.pln2,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rEbt}-${col}${rCit}`,
  });
  addPlRow({
    code: 'PL_NET_MARGIN_PCT',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    wfRole: 'NONE',
    label: '% przychodów (Marża netto)',
    fmt: NUM_FMT.pct1,
    role: 'pct',
    monthFormula: (_m, col) => `IF(${col}${rRev}=0,0,${col}${rNet}/${col}${rRev})`,
    yearFormula: () => `IF(R${rRev}=0,0,R${rNet}/R${rRev})`,
  });

  const endRow = row - 1;
  wb.definedNames.add(rangeRef(SHEET_NAMES.PL, 1, hdrRow, 18, endRow), 'STMT_PL');

  ws.columns = [
    { width: 20 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 34 },
    ...Array.from({ length: 12 }, () => ({ width: 13 })),
    { width: 15 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF0F766E', hiddenCols: [1, 2, 3, 4] });

  return ws;
}

function build05BS(wb: ExcelJS.Workbook, reg: RowRegistry): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SHEET_NAMES.BS);
  ws.views = [{ state: 'frozen', xSplit: 6, ySplit: 4 }];

  setVal(ws, 1, 5, 'BETA — Bilans (stan na koniec okresu, PLN netto)', 'title', undefined, 'left');
  setVal(ws, 2, 5, 'Kolumna Moment zero (31.12.2026) pobiera wyłącznie zamrożone pozycje BO_*.', 'subtitle', undefined, 'left');

  const hdrRow = 4;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', 'Moment zero', ...MONTHS_PL].forEach(
    (h, idx) =>
      setVal(ws, hdrRow, idx + 1, h, idx < 4 ? 'tech' : 'tableHeader', undefined, idx >= 5 ? 'right' : 'left'),
  );

  let row = 5;
  const addSection = (code: string, label: string) => {
    const r = row++;
    reg.bs[code] = r;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, 'SECTION', 'tech', undefined, 'left');
    setVal(ws, r, 3, 'NONE', 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    fillSectionRow(ws, r, label, 5, 18);
  };

  const addBsRow = (opts: {
    code: string;
    rowType: string;
    label: string;
    fmt: string;
    role: CellRole;
    zeroFormula: string;
    monthFormula: (m: number, col: string, prevCol: string) => string;
  }): number => {
    const r = row++;
    reg.bs[opts.code] = r;
    setVal(ws, r, 1, opts.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, opts.rowType, 'tech', undefined, 'left');
    setVal(ws, r, 3, 'LAST', 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    setVal(
      ws,
      r,
      5,
      opts.label,
      opts.role === 'total' || opts.role === 'check' ? opts.role : 'text',
      undefined,
      'left',
    );
    setFormula(ws, r, 6, opts.zeroFormula, 'link', opts.fmt, 'right');
    ws.getCell(r, 6).fill = opts.role === 'total' ? FILLS.total : FILLS.zeroCol;
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(6 + m); // G..R
      const prevCol = colLetter(5 + m); // F..Q
      setFormula(ws, r, 6 + m, opts.monthFormula(m, col, prevCol), opts.role, opts.fmt, 'right');
    }
    return r;
  };

  const opColForBs = (bsCol: string) => {
    const mIdx = bsCol.charCodeAt(0) - 'G'.charCodeAt(0); // 0..11
    return colLetter(4 + mIdx); // D..O
  };
  const plColForBs = (bsCol: string) => {
    const mIdx = bsCol.charCodeAt(0) - 'G'.charCodeAt(0); // 0..11
    return colLetter(6 + mIdx); // F..Q
  };

  addSection('BS_SEC_ASSETS', 'AKTYWA');
  const rFa = addBsRow({
    code: 'BS_FA_NET',
    rowType: 'DETAIL',
    label: 'Aktywa trwałe netto',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_FA_NET',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_FA_NET}`),
  });
  const rInv = addBsRow({
    code: 'BS_INVENTORY',
    rowType: 'DETAIL',
    label: 'Zapasy',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_INV_TOTAL',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_INV_TOTAL}`),
  });
  const rAr = addBsRow({
    code: 'BS_AR_TRADE',
    rowType: 'DETAIL',
    label: 'Należności handlowe',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_AR_TOTAL',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_AR_TOTAL}`),
  });
  const rOtherAr = addBsRow({
    code: 'BS_AR_OTHER',
    rowType: 'DETAIL',
    label: 'Pozostałe należności',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_OTHER_AR',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_OTHER_AR}`),
  });
  const rCash = addBsRow({
    code: 'BS_CASH',
    rowType: 'DETAIL',
    label: 'Środki pieniężne',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_CASH',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_CASH_END}`),
  });
  const rAssets = addBsRow({
    code: 'BS_ASSETS_TOTAL',
    rowType: 'TOTAL',
    label: 'AKTYWA RAZEM',
    fmt: NUM_FMT.pln2,
    role: 'total',
    zeroFormula: `SUM(F${rFa}:F${rCash})`,
    monthFormula: (_m, col) => `SUM(${col}${rFa}:${col}${rCash})`,
  });

  addSection('BS_SEC_LIAB', 'PASYWA');
  const rEq = addBsRow({
    code: 'BS_EQUITY',
    rowType: 'DETAIL',
    label: 'Kapitały własne (w tym wynik bieżący)',
    fmt: NUM_FMT.pln2,
    role: 'formula',
    zeroFormula: 'BO_EQUITY',
    monthFormula: (_m, col, prevCol) =>
      `${prevCol}${reg.bs.BS_EQUITY}+${qRef(SHEET_NAMES.PL, `${plColForBs(col)}${reg.pl.PL_NET_INCOME}`)}`,
  });
  const rAp = addBsRow({
    code: 'BS_AP_TRADE',
    rowType: 'DETAIL',
    label: 'Zobowiązania handlowe',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_AP_TOTAL',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_AP_TOTAL}`),
  });
  const rDef = addBsRow({
    code: 'BS_DEFERRED_GRANT',
    rowType: 'DETAIL',
    label: 'Rozliczenia międzyokresowe bierne (dotacja UE)',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_DEFERRED_GRANT',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_DEFERRED_GRANT}`),
  });
  const rLoan = addBsRow({
    code: 'BS_LOAN',
    rowType: 'DETAIL',
    label: 'Kredyt inwestycyjny',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_LOAN',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_LOAN_END}`),
  });
  const rOv = addBsRow({
    code: 'BS_OVERDRAFT',
    rowType: 'DETAIL',
    label: 'Overdraft',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_OVERDRAFT',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_OV_END}`),
  });
  const rSl = addBsRow({
    code: 'BS_SH_LOAN',
    rowType: 'DETAIL',
    label: 'Pożyczka od wspólników',
    fmt: NUM_FMT.pln2,
    role: 'link',
    zeroFormula: 'BO_SH_LOAN',
    monthFormula: (_m, col) => qRef(SHEET_NAMES.OPERATIONS, `${opColForBs(col)}${reg.op.OP_SL_END}`),
  });
  const rLiab = addBsRow({
    code: 'BS_LIAB_TOTAL',
    rowType: 'TOTAL',
    label: 'PASYWA RAZEM',
    fmt: NUM_FMT.pln2,
    role: 'total',
    zeroFormula: `SUM(F${rEq}:F${rSl})`,
    monthFormula: (_m, col) => `SUM(${col}${rEq}:${col}${rSl})`,
  });
  const rChk = addBsRow({
    code: 'BS_CHECK_BALANCE',
    rowType: 'CHECK',
    label: 'Kontrola: Aktywa − Pasywa (powinno być 0)',
    fmt: NUM_FMT.pln2,
    role: 'check',
    zeroFormula: `F${rAssets}-F${rLiab}`,
    monthFormula: (_m, col) => `${col}${rAssets}-${col}${rLiab}`,
  });

  wb.definedNames.add(rangeRef(SHEET_NAMES.BS, 1, hdrRow, 18, rChk), 'STMT_BS');
  wb.definedNames.add(rangeRef(SHEET_NAMES.BS, 6, rChk, 18, rChk), 'ROW_BS_CHECK');

  ws.columns = [
    { width: 20 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 42 },
    { width: 15 },
    ...Array.from({ length: 12 }, () => ({ width: 14 })),
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF0F766E', hiddenCols: [1, 2, 3, 4] });

  return ws;
}

function build06CF(wb: ExcelJS.Workbook, reg: RowRegistry): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SHEET_NAMES.CF);
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 4 }];

  setVal(ws, 1, 5, 'BETA — Rachunek przepływów pieniężnych (metoda pośrednia, PLN netto)', 'title', undefined, 'left');
  setVal(ws, 2, 5, 'Uzgodnienie zmian kapitału obrotowego i finansowania z bilansem.', 'subtitle', undefined, 'left');

  const hdrRow = 4;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Pozycja', ...MONTHS_PL, 'Rok'].forEach((h, idx) =>
    setVal(ws, hdrRow, idx + 1, h, idx < 4 ? 'tech' : 'tableHeader', undefined, idx >= 5 ? 'right' : 'left'),
  );

  let row = 5;
  const addSection = (code: string, label: string) => {
    const r = row++;
    reg.cf[code] = r;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, 'SECTION', 'tech', undefined, 'left');
    setVal(ws, r, 3, 'NONE', 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    fillSectionRow(ws, r, label, 5, 18);
  };

  const addCfRow = (opts: {
    code: string;
    rowType: string;
    aggMode: string;
    label: string;
    fmt: string;
    role: CellRole;
    monthFormula: (m: number, col: string) => string;
    yearFormula?: (r: number) => string;
  }): number => {
    const r = row++;
    reg.cf[opts.code] = r;
    setVal(ws, r, 1, opts.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, opts.rowType, 'tech', undefined, 'left');
    setVal(ws, r, 3, opts.aggMode, 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    setVal(
      ws,
      r,
      5,
      opts.label,
      opts.role === 'total' || opts.role === 'subtotal' || opts.role === 'check' ? opts.role : 'text',
      undefined,
      'left',
    );
    for (let m = 1; m <= 12; m++) {
      const col = colLetter(5 + m); // F..Q
      setFormula(ws, r, 5 + m, opts.monthFormula(m, col), opts.role, opts.fmt, 'right');
    }
    const yf = opts.yearFormula ? opts.yearFormula(r) : `SUM(F${r}:Q${r})`;
    setFormula(
      ws,
      r,
      18,
      yf,
      opts.role === 'total' ? 'total' : opts.role === 'check' ? 'check' : 'subtotal',
      opts.fmt,
      'right',
    );
    return r;
  };

  const opColForCf = (m: number) => colLetter(3 + m); // D..O
  const opPrevColForCf = (m: number) => colLetter(2 + m); // C..N (C = Moment Zero)
  const plColForCf = (m: number) => colLetter(5 + m); // F..Q
  const bsColForCf = (m: number) => colLetter(6 + m); // G..R

  addSection('CF_SEC_OP', 'DZIAŁALNOŚĆ OPERACYJNA');
  const rNet = addCfRow({
    code: 'CF_NET_INCOME',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Wynik netto',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.PL, `${plColForCf(m)}${reg.pl.PL_NET_INCOME}`),
  });
  const rDepr = addCfRow({
    code: 'CF_DEPR',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Amortyzacja',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.PL, `${plColForCf(m)}${reg.pl.PL_DEPR}`),
  });
  const rGrant = addCfRow({
    code: 'CF_GRANT_NONCASH',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Rozliczenie dotacji UE (bez wpływu pieniężnego)',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => `-${qRef(SHEET_NAMES.PL, `${plColForCf(m)}${reg.pl.PL_GRANT_RELEASE}`)}`,
  });
  const rDAr = addCfRow({
    code: 'CF_DELTA_AR',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zmiana należności handlowych',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) =>
      `-(${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_AR_TOTAL}`)}-${qRef(SHEET_NAMES.OPERATIONS, `${opPrevColForCf(m)}${reg.op.OP_AR_TOTAL}`)})`,
  });
  const rDOr = addCfRow({
    code: 'CF_DELTA_OTHER_AR',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zmiana pozostałych należności',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) =>
      `-(${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_OTHER_AR}`)}-${qRef(SHEET_NAMES.OPERATIONS, `${opPrevColForCf(m)}${reg.op.OP_OTHER_AR}`)})`,
  });
  const rDInv = addCfRow({
    code: 'CF_DELTA_INV',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zmiana zapasów',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) =>
      `-(${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_INV_TOTAL}`)}-${qRef(SHEET_NAMES.OPERATIONS, `${opPrevColForCf(m)}${reg.op.OP_INV_TOTAL}`)})`,
  });
  const rDAp = addCfRow({
    code: 'CF_DELTA_AP',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zmiana zobowiązań handlowych',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) =>
      `${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_AP_TOTAL}`)}-${qRef(SHEET_NAMES.OPERATIONS, `${opPrevColForCf(m)}${reg.op.OP_AP_TOTAL}`)}`,
  });
  const rCfo = addCfRow({
    code: 'CF_CFO',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    label: 'Przepływy z działalności operacyjnej',
    fmt: NUM_FMT.pln2,
    role: 'total',
    monthFormula: (_m, col) => `SUM(${col}${rNet}:${col}${rDAp})`,
  });

  addSection('CF_SEC_INV', 'DZIAŁALNOŚĆ INWESTYCYJNA');
  const rCapex = addCfRow({
    code: 'CF_CAPEX',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zakup nowej linii produkcyjnej (CapEx)',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => `-${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_CAPEX}`)}`,
  });
  const rCfi = addCfRow({
    code: 'CF_CFI',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    label: 'Przepływy z działalności inwestycyjnej',
    fmt: NUM_FMT.pln2,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rCapex}`,
  });

  addSection('CF_SEC_FIN', 'DZIAŁALNOŚĆ FINANSOWA');
  const rLoanDisb = addCfRow({
    code: 'CF_LOAN_DISB',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Uruchomienie kredytu inwestycyjnego',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_LOAN_DISB}`),
  });
  const rLoanRep = addCfRow({
    code: 'CF_LOAN_REP',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Spłata kapitału kredytu',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => `-${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_LOAN_REP}`)}`,
  });
  const rDeltaOv = addCfRow({
    code: 'CF_DELTA_OV',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Zmiana overdraftu',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_OV_DELTA}`),
  });
  const rSlDisb = addCfRow({
    code: 'CF_SH_LOAN_DISB',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Pożyczka od wspólników – uruchomienie',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_SL_DISB}`),
  });
  const rSlRep = addCfRow({
    code: 'CF_SH_LOAN_REP',
    rowType: 'DETAIL',
    aggMode: 'SUM',
    label: 'Pożyczka od wspólników – spłata',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => `-${qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_SL_REP}`)}`,
  });
  const rCff = addCfRow({
    code: 'CF_CFF',
    rowType: 'TOTAL',
    aggMode: 'SUM',
    label: 'Przepływy z działalności finansowej',
    fmt: NUM_FMT.pln2,
    role: 'total',
    monthFormula: (_m, col) => `SUM(${col}${rLoanDisb}:${col}${rSlRep})`,
  });

  addSection('CF_SEC_CASH', 'STAN ŚRODKÓW PIENIĘŻNYCH');
  const rDeltaCash = addCfRow({
    code: 'CF_NET_CASH_CHANGE',
    rowType: 'SUBTOTAL',
    aggMode: 'SUM',
    label: 'Zmiana stanu środków pieniężnych',
    fmt: NUM_FMT.pln2,
    role: 'subtotal',
    monthFormula: (_m, col) => `${col}${rCfo}+${col}${rCfi}+${col}${rCff}`,
  });
  const rCashOpen = addCfRow({
    code: 'CF_CASH_OPEN',
    rowType: 'DETAIL',
    aggMode: 'FIRST',
    label: 'Środki pieniężne na początek',
    fmt: NUM_FMT.pln2,
    role: 'link',
    monthFormula: (m) => qRef(SHEET_NAMES.OPERATIONS, `${opColForCf(m)}${reg.op.OP_CASH_OPEN}`),
    yearFormula: (r) => `F${r}`,
  });
  const rCashEnd = addCfRow({
    code: 'CF_CASH_END',
    rowType: 'TOTAL',
    aggMode: 'LAST',
    label: 'Środki pieniężne na koniec',
    fmt: NUM_FMT.pln2,
    role: 'total',
    monthFormula: (_m, col) => `${col}${rCashOpen}+${col}${rDeltaCash}`,
    yearFormula: (r) => `Q${r}`,
  });
  const rChk = addCfRow({
    code: 'CF_CHECK_VS_BS',
    rowType: 'CHECK',
    aggMode: 'LAST',
    label: 'Kontrola: CF – Bilans (powinno być 0)',
    fmt: NUM_FMT.pln2,
    role: 'check',
    monthFormula: (m, col) =>
      `${col}${rCashEnd}-${qRef(SHEET_NAMES.BS, `${bsColForCf(m)}${reg.bs.BS_CASH}`)}`,
    yearFormula: () => `R${rCashEnd}-${qRef(SHEET_NAMES.BS, `R${reg.bs.BS_CASH}`)}`,
  });

  wb.definedNames.add(rangeRef(SHEET_NAMES.CF, 1, hdrRow, 18, rChk), 'STMT_CF');
  wb.definedNames.add(rangeRef(SHEET_NAMES.CF, 6, rChk, 18, rChk), 'ROW_CF_CHECK');

  ws.columns = [
    { width: 22 },
    { width: 11 },
    { width: 11 },
    { width: 11 },
    { width: 44 },
    ...Array.from({ length: 12 }, () => ({ width: 14 })),
    { width: 15 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF0F766E', hiddenCols: [1, 2, 3, 4] });

  return ws;
}

function build07RatiosAndChecks(wb: ExcelJS.Workbook, reg: RowRegistry): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(SHEET_NAMES.RATIOS);
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 4 }];

  setVal(ws, 1, 5, 'BETA — Wskaźniki finansowe i Audytor Integralności (v1.0)', 'title', undefined, 'left');
  setVal(ws, 2, 5, 'Rentowność, płynność, kapitał obrotowy (trailing 3M) oraz bramki kontrolne.', 'subtitle', undefined, 'left');

  const hdrRow = 4;
  ['LINE_CODE', 'ROW_TYPE', 'AGG_MODE', 'WF_ROLE', 'Wskaźnik', ...MONTHS_PL, 'Rok / Koniec'].forEach(
    (h, idx) =>
      setVal(ws, hdrRow, idx + 1, h, idx < 4 ? 'tech' : 'tableHeader', undefined, idx >= 5 ? 'right' : 'left'),
  );

  let row = 5;
  const addSection = (code: string, label: string) => {
    const r = row++;
    reg.rt[code] = r;
    setVal(ws, r, 1, code, 'tech', undefined, 'left');
    setVal(ws, r, 2, 'SECTION', 'tech', undefined, 'left');
    setVal(ws, r, 3, 'NONE', 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    fillSectionRow(ws, r, label, 5, 18);
  };

  const addRtRow = (opts: {
    code: string;
    rowType: string;
    aggMode: string;
    label: string;
    fmt: string;
    monthFormula: (m: number) => string;
    yearFormula: (r: number) => string;
  }): number => {
    const r = row++;
    reg.rt[opts.code] = r;
    setVal(ws, r, 1, opts.code, 'tech', undefined, 'left');
    setVal(ws, r, 2, opts.rowType, 'tech', undefined, 'left');
    setVal(ws, r, 3, opts.aggMode, 'tech', undefined, 'left');
    setVal(ws, r, 4, 'NONE', 'tech', undefined, 'left');
    setVal(ws, r, 5, opts.label, 'text', undefined, 'left');
    for (let m = 1; m <= 12; m++) {
      setFormula(ws, r, 5 + m, opts.monthFormula(m), 'formula', opts.fmt, 'right');
    }
    setFormula(ws, r, 18, opts.yearFormula(r), 'subtotal', opts.fmt, 'right');
    return r;
  };

  const plCell = (code: string, m: number) =>
    qRef(SHEET_NAMES.PL, `${colLetter(5 + m)}${reg.pl[code]}`);
  const plYear = (code: string) => qRef(SHEET_NAMES.PL, `R${reg.pl[code]}`);
  const bsCell = (code: string, m: number) =>
    qRef(SHEET_NAMES.BS, `${colLetter(6 + m)}${reg.bs[code]}`);

  addSection('RT_SEC_PROF', 'RENTOWNOŚĆ');
  addRtRow({
    code: 'RT_CM_MARGIN',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    label: 'Marża po kosztach zmiennych',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) => `IF(${plCell('PL_REV_TOTAL', m)}=0,0,${plCell('PL_CONTRIB_MARGIN', m)}/${plCell('PL_REV_TOTAL', m)})`,
    yearFormula: () => `IF(${plYear('PL_REV_TOTAL')}=0,0,${plYear('PL_CONTRIB_MARGIN')}/${plYear('PL_REV_TOTAL')})`,
  });
  addRtRow({
    code: 'RT_EBITDA_MARGIN',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    label: 'Marża EBITDA',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) => `IF(${plCell('PL_REV_TOTAL', m)}=0,0,${plCell('PL_EBITDA', m)}/${plCell('PL_REV_TOTAL', m)})`,
    yearFormula: () => `IF(${plYear('PL_REV_TOTAL')}=0,0,${plYear('PL_EBITDA')}/${plYear('PL_REV_TOTAL')})`,
  });
  addRtRow({
    code: 'RT_EBIT_MARGIN',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    label: 'Marża EBIT',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) => `IF(${plCell('PL_REV_TOTAL', m)}=0,0,${plCell('PL_EBIT', m)}/${plCell('PL_REV_TOTAL', m)})`,
    yearFormula: () => `IF(${plYear('PL_REV_TOTAL')}=0,0,${plYear('PL_EBIT')}/${plYear('PL_REV_TOTAL')})`,
  });
  addRtRow({
    code: 'RT_NET_MARGIN',
    rowType: 'PCT',
    aggMode: 'RATIO_REF',
    label: 'Marża netto',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) => `IF(${plCell('PL_REV_TOTAL', m)}=0,0,${plCell('PL_NET_INCOME', m)}/${plCell('PL_REV_TOTAL', m)})`,
    yearFormula: () => `IF(${plYear('PL_REV_TOTAL')}=0,0,${plYear('PL_NET_INCOME')}/${plYear('PL_REV_TOTAL')})`,
  });

  addSection('RT_SEC_LIQ', 'PŁYNNOŚĆ I ZADŁUŻENIE');
  const currentLiabExpr = (m: number) =>
    `(${bsCell('BS_AP_TRADE', m)}+${bsCell('BS_OVERDRAFT', m)}+${bsCell('BS_SH_LOAN', m)}+MIN(${bsCell('BS_LOAN', m)},IF(CFG_LOAN_INSTALLMENTS<=0,0,4*CFG_LOAN_AMOUNT/CFG_LOAN_INSTALLMENTS)))`;
  addRtRow({
    code: 'RT_CURRENT_RATIO',
    rowType: 'RATIO',
    aggMode: 'LAST',
    label: 'Płynność bieżąca (x)',
    fmt: NUM_FMT.ratio,
    monthFormula: (m) => {
      const cl = currentLiabExpr(m);
      return `IF(${cl}=0,0,(${bsCell('BS_INVENTORY', m)}+${bsCell('BS_AR_TRADE', m)}+${bsCell('BS_AR_OTHER', m)}+${bsCell('BS_CASH', m)})/${cl})`;
    },
    yearFormula: (r) => `Q${r}`,
  });
  addRtRow({
    code: 'RT_QUICK_RATIO',
    rowType: 'RATIO',
    aggMode: 'LAST',
    label: 'Płynność szybka (x)',
    fmt: NUM_FMT.ratio,
    monthFormula: (m) => {
      const cl = currentLiabExpr(m);
      return `IF(${cl}=0,0,(${bsCell('BS_AR_TRADE', m)}+${bsCell('BS_AR_OTHER', m)}+${bsCell('BS_CASH', m)})/${cl})`;
    },
    yearFormula: (r) => `Q${r}`,
  });
  addRtRow({
    code: 'RT_NET_DEBT',
    rowType: 'DETAIL',
    aggMode: 'LAST',
    label: 'Dług netto (PLN)',
    fmt: NUM_FMT.pln,
    monthFormula: (m) =>
      `${bsCell('BS_OVERDRAFT', m)}+${bsCell('BS_SH_LOAN', m)}+${bsCell('BS_LOAN', m)}-${bsCell('BS_CASH', m)}`,
    yearFormula: (r) => `Q${r}`,
  });
  addRtRow({
    code: 'RT_OV_UTIL',
    rowType: 'PCT',
    aggMode: 'LAST',
    label: 'Wykorzystanie limitu overdraftu',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) => `IF(CFG_OV_LIMIT=0,0,${bsCell('BS_OVERDRAFT', m)}/CFG_OV_LIMIT)`,
    yearFormula: (r) => `Q${r}`,
  });
  addRtRow({
    code: 'RT_EQUITY_RATIO',
    rowType: 'PCT',
    aggMode: 'LAST',
    label: 'Kapitał własny / aktywa',
    fmt: NUM_FMT.pct1,
    monthFormula: (m) =>
      `IF(${bsCell('BS_ASSETS_TOTAL', m)}=0,0,${bsCell('BS_EQUITY', m)}/${bsCell('BS_ASSETS_TOTAL', m)})`,
    yearFormula: (r) => `Q${r}`,
  });

  addSection('RT_SEC_WC', 'KAPITAŁ OBROTOWY');
  addRtRow({
    code: 'RT_DSO',
    rowType: 'DAYS',
    aggMode: 'LAST',
    label: 'DSO: dni należności (trailing 3M)',
    fmt: NUM_FMT.days,
    monthFormula: (m) => {
      const startM = Math.max(1, m - 2);
      const revRange = qRef(
        SHEET_NAMES.PL,
        `${colLetter(5 + startM)}${reg.pl.PL_REV_TOTAL}:${colLetter(5 + m)}${reg.pl.PL_REV_TOTAL}`,
      );
      return `IF(AVERAGE(${revRange})<=0,0,${bsCell('BS_AR_TRADE', m)}/(AVERAGE(${revRange})/CFG_DAYS_IN_MONTH))`;
    },
    yearFormula: (r) => `Q${r}`,
  });
  addRtRow({
    code: 'RT_DIO',
    rowType: 'DAYS',
    aggMode: 'LAST',
    label: 'DIO: dni zapasów (wg kosztu surowca, trailing 3M)',
    fmt: NUM_FMT.days,
    monthFormula: (m) => {
      const startM = Math.max(1, m - 2);
      const cogsRange = qRef(
        SHEET_NAMES.PL,
        `${colLetter(5 + startM)}${reg.pl.PL_COGS_RAW}:${colLetter(5 + m)}${reg.pl.PL_COGS_RAW}`,
      );
      return `IF(AVERAGE(${cogsRange})<=0,0,${bsCell('BS_INVENTORY', m)}/(AVERAGE(${cogsRange})/CFG_DAYS_IN_MONTH))`;
    },
    yearFormula: (r) => `Q${r}`,
  });
  const rNwc = addRtRow({
    code: 'RT_NWC',
    rowType: 'DETAIL',
    aggMode: 'LAST',
    label: 'Kapitał obrotowy netto (PLN)',
    fmt: NUM_FMT.pln,
    monthFormula: (m) =>
      `${bsCell('BS_INVENTORY', m)}+${bsCell('BS_AR_TRADE', m)}+${bsCell('BS_AR_OTHER', m)}-${bsCell('BS_AP_TRADE', m)}`,
    yearFormula: (r) => `Q${r}`,
  });

  wb.definedNames.add(rangeRef(SHEET_NAMES.RATIOS, 1, hdrRow, 18, rNwc), 'STMT_RATIOS');

  // Tabela 2: TBL_AUDIT_CHECKS (wyrównana pod kolumną E „Wskaźnik”, kolumna D CheckCode ukryta)
  const chkSecRow = rNwc + 2;
  const chkHdrRow = chkSecRow + 1;
  fillSectionRow(ws, chkSecRow, 'AUDYTOR SPÓJNOŚCI MODELU (TBL_AUDIT_CHECKS)', 5, 9);
  ['CheckCode', 'CheckName', 'Severity', 'ActualValue', 'Tolerance', 'Status'].forEach((h, idx) =>
    setVal(
      ws,
      chkHdrRow,
      4 + idx,
      h,
      idx === 0 ? 'tech' : 'tableHeader',
      undefined,
      idx === 3 || idx === 4 ? 'right' : idx === 5 || idx === 2 ? 'center' : 'left',
    ),
  );

  const checks: Array<[string, string, 'CRITICAL' | 'WARNING', string, number, string]> = [
    [
      'CHK_BS_BALANCE',
      'Równowaga bilansu (Aktywa = Pasywa w BO i M1–M12)',
      'CRITICAL',
      'MAX(ABS(MAX(ROW_BS_CHECK)),ABS(MIN(ROW_BS_CHECK)))',
      0.01,
      NUM_FMT.pln2,
    ],
    [
      'CHK_CF_VS_BS',
      'Uzgodnienie gotówki CF vs Bilans',
      'CRITICAL',
      'MAX(ABS(MAX(ROW_CF_CHECK)),ABS(MIN(ROW_CF_CHECK)))',
      0.01,
      NUM_FMT.pln2,
    ],
    [
      'CHK_ALLOC_VS_PL',
      'Uzgodnienie kosztów działów vs RZiS (przed CIT)',
      'CRITICAL',
      'MAX(ABS(MAX(ROW_ALLOC_DIFF)),ABS(MIN(ROW_ALLOC_DIFF)))',
      0.01,
      NUM_FMT.pln2,
    ],
    [
      'CHK_ALLOC_MATRIX_100',
      'Każda linia kosztowa alokowana w 100%',
      'CRITICAL',
      'MAX(ABS(MAX(COL_ALLOC_ROW_SUMS)-1),ABS(MIN(COL_ALLOC_ROW_SUMS)-1))',
      0.0001,
      NUM_FMT.pct2,
    ],
    [
      'CHK_RENT_SHARE_100',
      'Suma udziałów najmu równa 100%',
      'CRITICAL',
      'ABS(SUM(COL_DEPT_RENT_SHARE)-1)',
      0.0001,
      NUM_FMT.pct2,
    ],
    [
      'CHK_HEADCOUNT_SYNC',
      'Spójność etatu łącznego (CFG_HEADCOUNT_TOTAL = SUM działów)',
      'CRITICAL',
      'ABS(CFG_HEADCOUNT_TOTAL-SUM(COL_DEPT_HEADCOUNT))',
      0.0001,
      NUM_FMT.ratio,
    ],
    [
      'CHK_OV_LIMIT_BREACH',
      'Respektowanie limitu overdraftu',
      'CRITICAL',
      'MAX(0,MAX(ROW_OV_END)-CFG_OV_LIMIT)',
      0.01,
      NUM_FMT.pln2,
    ],
    [
      'CHK_SH_LOAN_TRIGGERED',
      'Uruchomienie awaryjnej pożyczki wspólników (ostrzeżenie)',
      'WARNING',
      'MAX(ROW_SL_END)',
      0.01,
      NUM_FMT.pln2,
    ],
  ];

  const chkStart = chkHdrRow + 1;
  checks.forEach(([code, name, sev, formula, tol, fmt], idx) => {
    const r = chkStart + idx;
    setVal(ws, r, 4, code, 'tech', undefined, 'left');
    setVal(ws, r, 5, name, 'text', undefined, 'left');
    setVal(ws, r, 6, sev, 'tech', undefined, 'center');
    setFormula(ws, r, 7, formula, 'formula', fmt, 'right');
    setVal(ws, r, 8, tol, 'input', fmt, 'right');
    setFormula(ws, r, 9, `IF(G${r}<=H${r},"OK",IF(F${r}="WARNING","UWAGA","BLAD"))`, 'check', undefined, 'center');
  });
  const chkEnd = chkStart + checks.length - 1;
  wb.definedNames.add(rangeRef(SHEET_NAMES.RATIOS, 4, chkHdrRow, 9, chkEnd), 'TBL_AUDIT_CHECKS');

  ws.columns = [
    { width: 20 },
    { width: 11 },
    { width: 11 },
    { width: 24 },
    { width: 46 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    { width: 14 },
    ...Array.from({ length: 8 }, () => ({ width: 14 })),
    { width: 16 },
  ];

  polishWorksheetAppearance(ws, { tabColor: 'FF7C3AED', hiddenCols: [1, 2, 3, 4] });

  return ws;
}

function wireCrossSheetLinks(
  wb: ExcelJS.Workbook,
  reg: RowRegistry,
  headcountRow: number,
  allocMeta: ReturnType<typeof build02AllocationStructure>,
): void {
  const wsAsm = wb.getWorksheet(SHEET_NAMES.ASSUMPTIONS)!;
  const wsAlloc = wb.getWorksheet(SHEET_NAMES.ALLOCATION)!;
  const wsOp = wb.getWorksheet(SHEET_NAMES.OPERATIONS)!;

  // 1. CFG_HEADCOUNT_TOTAL = SUM(COL_DEPT_HEADCOUNT)
  setFormula(wsAsm, headcountRow, 3, 'SUM(COL_DEPT_HEADCOUNT)', 'link', NUM_FMT.int, 'right');

  // 2. Linki z 06_CashFlow do 03_Model_Operacyjny (OP_CFO_LINK, OP_CFI_LINK)
  for (let m = 1; m <= 12; m++) {
    const cfCol = colLetter(5 + m); // F..Q
    setFormula(
      wsOp,
      reg.op.OP_CFO_LINK,
      3 + m,
      qRef(SHEET_NAMES.CF, `${cfCol}${reg.cf.CF_CFO}`),
      'link',
      NUM_FMT.pln2,
      'right',
    );
    setFormula(
      wsOp,
      reg.op.OP_CFI_LINK,
      3 + m,
      qRef(SHEET_NAMES.CF, `${cfCol}${reg.cf.CF_CFI}`),
      'link',
      NUM_FMT.pln2,
      'right',
    );
  }

  // 3. Wypełnienie TBL_COST_LINES_MONTHLY w 02_Alokacja_Dzialy z 04_RZiS
  const lineToPl: Record<string, string> = {
    COST_RAW: 'PL_COGS_RAW',
    COST_PROC: 'PL_VAR_PROC',
    COST_SUB: 'PL_VAR_SUB',
    COST_LOG: 'PL_VAR_LOG',
    COST_MKT: 'PL_VAR_MKT',
    COST_SALES_FIX: 'PL_FIX_SALES',
    COST_WAGES: 'PL_FIX_WAGES',
    COST_ZUS: 'PL_FIX_ZUS',
    COST_RENT: 'PL_FIX_RENT',
    COST_OTH_FIX: 'PL_FIX_OTHER',
    COST_DEPR: 'PL_DEPR',
    COST_FIN: 'PL_FIN_TOTAL',
  };

  for (const [lineCode, clRow] of Object.entries(reg.costLineRow)) {
    const plRow = reg.pl[lineToPl[lineCode]];
    for (let m = 1; m <= 12; m++) {
      const plCol = colLetter(5 + m); // F..Q
      setFormula(
        wsAlloc,
        clRow,
        4 + m,
        qRef(SHEET_NAMES.PL, `${plCol}${plRow}`),
        'link',
        NUM_FMT.pln2,
        'right',
      );
    }
    setFormula(wsAlloc, clRow, 17, `SUM(E${clRow}:P${clRow})`, 'subtotal', NUM_FMT.pln2, 'right');

    // Kolumny pomocnicze PLN Rok dla SUMIF obok TBL_ALLOC_MATRIX
    const allocRow = reg.allocLine[lineCode];
    const deptCodes = Object.keys(reg.allocDept);
    deptCodes.forEach((_dc, di) => {
      const weightCol = colLetter(6 + di); // F..K
      const helperCol = allocMeta.helperStartCol + di;
      setFormula(
        wsAlloc,
        allocRow,
        helperCol,
        `${weightCol}${allocRow}*$Q$${clRow}`,
        'formula',
        NUM_FMT.pln2,
        'right',
      );
    });
  }

  // Wiersz sumy TBL_COST_LINES_MONTHLY
  const clStart = reg.ranges.costLinesStart;
  const clEnd = reg.ranges.costLinesEnd;
  const clTotRow = reg.ranges.costLinesTotalRow;
  for (let m = 1; m <= 13; m++) {
    const col = colLetter(4 + m); // E..Q
    setFormula(wsAlloc, clTotRow, 4 + m, `SUM(${col}${clStart}:${col}${clEnd})`, 'total', NUM_FMT.pln2, 'right');
  }

  // 4. Wypełnienie TBL_DEPT_COSTS_MONTHLY w 02_Alokacja_Dzialy
  const deptCodes = Object.keys(reg.allocDept);
  const allocStart = reg.ranges.allocStart;
  const allocEnd = reg.ranges.allocEnd;
  const dcStart = reg.ranges.deptCostsStart;
  const dcEnd = reg.ranges.deptCostsEnd;
  const dcAllocSumRow = dcEnd + 1;
  const dcRzisSumRow = dcEnd + 2;
  const dcDiffRow = reg.ranges.allocDiffRow;

  deptCodes.forEach((dCode, di) => {
    const r = reg.deptCostRow[dCode];
    const wCol = colLetter(6 + di); // F..K w TBL_ALLOC_MATRIX
    for (let m = 1; m <= 12; m++) {
      const clCol = colLetter(4 + m); // E..P w TBL_COST_LINES_MONTHLY
      setFormula(
        wsAlloc,
        r,
        2 + m,
        `SUMPRODUCT(${wCol}$${allocStart}:${wCol}$${allocEnd},${clCol}$${clStart}:${clCol}$${clEnd})`,
        'formula',
        NUM_FMT.pln2,
        'right',
      );
    }
    setFormula(wsAlloc, r, 15, `SUM(C${r}:N${r})`, 'subtotal', NUM_FMT.pln2, 'right');
    setFormula(
      wsAlloc,
      r,
      16,
      `IF($O$${dcAllocSumRow}=0,0,O${r}/$O$${dcAllocSumRow})`,
      'pct',
      NUM_FMT.pct1,
      'right',
    );
  });

  // Podsumowanie i kontrola TBL_DEPT_COSTS_MONTHLY
  for (let m = 1; m <= 13; m++) {
    const dcCol = colLetter(2 + m); // C..O
    const clCol = colLetter(4 + m); // E..Q
    const plCol = colLetter(5 + m); // F..R
    setFormula(wsAlloc, dcAllocSumRow, 2 + m, `SUM(${dcCol}${dcStart}:${dcCol}${dcEnd})`, 'total', NUM_FMT.pln2, 'right');
    setFormula(
      wsAlloc,
      dcRzisSumRow,
      2 + m,
      `${qRef(SHEET_NAMES.PL, `${plCol}${reg.pl.PL_VAR_TOTAL}`)}+${qRef(SHEET_NAMES.PL, `${plCol}${reg.pl.PL_FIX_TOTAL}`)}+${qRef(SHEET_NAMES.PL, `${plCol}${reg.pl.PL_DEPR}`)}+${qRef(SHEET_NAMES.PL, `${plCol}${reg.pl.PL_FIN_TOTAL}`)}`,
      'link',
      NUM_FMT.pln2,
      'right',
    );
    setFormula(
      wsAlloc,
      dcDiffRow,
      2 + m,
      `${dcCol}${dcAllocSumRow}-${dcCol}${dcRzisSumRow}`,
      'check',
      NUM_FMT.pln2,
      'right',
    );
    // Upewnij się także, że suma udziałów
    if (m === 13) {
      setFormula(wsAlloc, dcAllocSumRow, 16, `SUM(P${dcStart}:P${dcEnd})`, 'total', NUM_FMT.pct1, 'right');
      // Sanity check clCol referenced cleanly
      void clCol;
    }
  }
}

function extractSheetsAndEvaluateWithHyperFormula(wb: ExcelJS.Workbook): {
  hf: HyperFormula;
  sheetIdMap: Map<string, number>;
  formulaCount: number;
} {
  const sheetsData: Record<string, (string | number | boolean | null)[][]> = {};

  wb.eachSheet((ws) => {
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;
    const matrix: (string | number | boolean | null)[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const rowArr: (string | number | boolean | null)[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = ws.getCell(r, c);
        const v = cell.value;
        if (v === null || v === undefined) {
          rowArr.push(null);
        } else if (typeof v === 'object' && 'formula' in v && v.formula) {
          rowArr.push(`=${v.formula}`);
        } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
          rowArr.push(v);
        } else {
          rowArr.push(String(v));
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

  const definedModel = wb.definedNames.model as Array<{ name: string; ranges: string[] }>;
  for (const def of definedModel) {
    if (def.name.startsWith('_xlnm.')) continue;
    if (!def.ranges || def.ranges.length === 0) continue;
    hf.addNamedExpression(def.name, `=${def.ranges[0]}`);
  }

  const sheetIdMap = new Map<string, number>();
  for (const name of hf.getSheetNames()) {
    const id = hf.getSheetId(name);
    if (id !== undefined) sheetIdMap.set(name, id);
  }

  let formulaCount = 0;
  const errors: string[] = [];

  wb.eachSheet((ws) => {
    const sheetId = sheetIdMap.get(ws.name);
    if (sheetId === undefined) return;
    ws.eachRow({ includeEmpty: false }, (row, rIdx) => {
      row.eachCell({ includeEmpty: false }, (cell, cIdx) => {
        const v = cell.value;
        if (v && typeof v === 'object' && 'formula' in v && v.formula) {
          formulaCount++;
          const val = hf.getCellValue({ sheet: sheetId, row: rIdx - 1, col: cIdx - 1 });
          if (val instanceof DetailedCellError) {
            errors.push(`${ws.name}!${cell.address} [=${v.formula}] -> ${val.value} (${val.message})`);
            return;
          }
          if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') {
            cell.value = { formula: v.formula, result: val };
          } else {
            errors.push(`${ws.name}!${cell.address} [=${v.formula}] -> unexpected result: ${String(val)}`);
          }
        }
      });
    });
  });

  if (errors.length > 0) {
    throw new Error(`HyperFormula evaluation errors (${errors.length}):\n${errors.slice(0, 20).join('\n')}`);
  }

  return { hf, sheetIdMap, formulaCount };
}

async function main(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FinPulse Template Generator';
  wb.created = new Date('2026-11-20T00:00:00Z');
  wb.properties.date1904 = false;
  wb.calcProperties = { fullCalcOnLoad: true };

  const reg: RowRegistry = {
    op: {},
    pl: {},
    bs: {},
    cf: {},
    rt: {},
    allocDept: {},
    allocLine: {},
    costLineRow: {},
    deptCostRow: {},
    ranges: {
      rawPricesQ: { start: 0, end: 0 },
      productsStart: 0,
      productsEnd: 0,
      deptStart: 0,
      deptEnd: 0,
      allocStart: 0,
      allocEnd: 0,
      costLinesStart: 0,
      costLinesEnd: 0,
      deptCostsStart: 0,
      deptCostsEnd: 0,
      costLinesTotalRow: 0,
      allocDiffRow: 0,
    },
  };

  // Przebieg 1: Budowa arkuszy i Named Ranges (kolejność zakładek zorientowana na użytkownika FP&A)
  const { headcountRow } = build01Assumptions(wb, reg);
  const allocMeta = build02AllocationStructure(wb, reg);
  build03Operations(wb, reg);
  build04PL(wb, reg);
  build05BS(wb, reg);
  build06CF(wb, reg);
  build07RatiosAndChecks(wb, reg);
  wireCrossSheetLinks(wb, reg, headcountRow, allocMeta);
  build00UI(wb);

  // Przebieg 2: Przeliczenie przez HyperFormula i wypełnienie cache <v>
  const { formulaCount } = extractSheetsAndEvaluateWithHyperFormula(wb);

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await wb.xlsx.writeFile(OUTPUT_PATH);

  const stats = await fs.stat(OUTPUT_PATH);
  const defCount = (wb.definedNames.model as unknown[]).length;
  console.log(
    `Generated ${OUTPUT_PATH} (${(stats.size / 1024).toFixed(1)} KB, ${wb.worksheets.length} sheets, ${defCount} named ranges, ${formulaCount} formula cells cached)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
