import ExcelJS from 'exceljs';
import {
  HyperFormulaEngine,
  isDetailedCellError,
  type FinancialEngineSession,
} from '@/engine/formulaEngine';
import { buildScenarioComparisonRows } from '@/engine/scenarioComparison';
import { cellPositionKey } from '@/parsers/excelAdapter';
import { buildMutationsForSliderValues } from '@/store/slices/simulationSlice';
import type { ScenarioSnapshot } from '@/types/scenario';
import { formatSliderValue } from '@/utils/formatters';

export interface ExportScenarioOptions {
  session: FinancialEngineSession;
  sliderValues: Record<string, number>;
  scenarioName: string;
  includeComparisonSheet?: boolean;
  comparisonScenarios?: ScenarioSnapshot[];
}

interface ExcelFormulaValueShape {
  formula?: string;
  sharedFormula?: string;
  shareType?: 'shared';
  ref?: string;
  result?: string | number | boolean;
}

function getComparisonExcelNumFmt(format: string): string {
  switch (format) {
    case 'percent':
      return '0.0%';
    case 'ratio':
      return '0.00"x"';
    case 'days':
      return '0.0" dni"';
    case 'check':
      return '#,##0.0000';
    case 'currency':
    default:
      return '#,##0';
  }
}

function appendComparisonWorksheet(
  wb: ExcelJS.Workbook,
  scenarios: ScenarioSnapshot[],
  session: FinancialEngineSession,
  activeScenarioName: string,
): void {
  if (!session.baseDomain || scenarios.length === 0) return;
  const sheetTitle = '99_Porownanie_Scenariuszy';
  const existing = wb.getWorksheet(sheetTitle);
  if (existing) {
    wb.removeWorksheet(existing.id);
  }

  const ws = wb.addWorksheet(sheetTitle);
  const currency = session.baseDomain.metadata.currency || 'PLN';
  const rows = buildScenarioComparisonRows(scenarios, session.baseDomain);

  // Nagłówek główny
  const titleCell = ws.getCell(1, 1);
  titleCell.value = `FinPulse — Porównanie Scenariuszy Side-by-Side (${session.baseDomain.metadata.companyName})`;
  titleCell.font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1730' } };

  const subCell = ws.getCell(2, 1);
  subCell.value = `Wyeksportowany wariant: ${activeScenarioName} · Waluta: ${currency} · Wygenerowano: ${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`;
  subCell.font = { size: 10, color: { argb: 'FFB4BBD8' } };
  subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1730' } };

  for (let c = 2; c <= 1 + scenarios.length; c++) {
    ws.getCell(1, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1730' } };
    ws.getCell(2, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0E1730' } };
  }

  // Wiersz nagłówków kolumn
  const hdrRowIdx = 4;
  const labelHdr = ws.getCell(hdrRowIdx, 1);
  labelHdr.value = `Metryka / Założenie (${currency})`;
  labelHdr.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
  labelHdr.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16233E' } };
  labelHdr.alignment = { horizontal: 'left', vertical: 'middle' };

  scenarios.forEach((sc, idx) => {
    const c = ws.getCell(hdrRowIdx, 2 + idx);
    c.value = sc.isBase ? `${sc.name} (Baza)` : sc.name;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF16233E' } };
    c.alignment = { horizontal: 'right', vertical: 'middle' };
  });

  // Wiersze danych
  let r = hdrRowIdx + 1;
  for (const item of rows) {
    if (item.rowKind === 'section') {
      const secCell = ws.getCell(r, 1);
      secCell.value = item.label;
      secCell.font = { bold: true, size: 10, color: { argb: 'FF9CC6FF' } };
      secCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2D4F' } };
      for (let c = 2; c <= 1 + scenarios.length; c++) {
        ws.getCell(r, c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E2D4F' } };
      }
      r++;
      continue;
    }

    const nameCell = ws.getCell(r, 1);
    nameCell.value = item.label;
    nameCell.font = { size: 10 };
    nameCell.alignment = { horizontal: 'left', vertical: 'middle' };

    scenarios.forEach((sc, idx) => {
      const val = item.valuesByScenarioId[sc.id];
      const cell = ws.getCell(r, 2 + idx);
      cell.alignment = { horizontal: 'right', vertical: 'middle' };

      if (val === null || val === undefined || !Number.isFinite(val)) {
        cell.value = '–';
        return;
      }

      if (item.format === 'slider' && item.sliderControl) {
        if (item.sliderControl.format === 'percent' || item.sliderControl.format === 'percent_signed') {
          cell.value = val;
          cell.numFmt = '0.0%';
        } else if (item.sliderControl.format === 'integer_os' || item.sliderControl.format === 'weight_share') {
          cell.value = val;
          cell.numFmt = '#,##0';
        } else {
          cell.value = formatSliderValue(item.sliderControl, val);
        }
      } else {
        cell.value = val;
        cell.numFmt = getComparisonExcelNumFmt(item.format);
      }
    });

    r++;
  }

  ws.columns = [
    { width: 42 },
    ...scenarios.map(() => ({ width: 22 })),
  ];
  ws.views = [{ state: 'frozen', xSplit: 1, ySplit: hdrRowIdx }];
}

export async function exportScenarioToXlsxBuffer(
  options: ExportScenarioOptions,
): Promise<Uint8Array> {
  const {
    session,
    sliderValues,
    scenarioName,
    includeComparisonSheet = true,
    comparisonScenarios,
  } = options;

  if (!session.baseDomain) {
    throw new Error('Brak poprawnego modelu domenowego do wyeksportowania.');
  }

  const tempEngine = new HyperFormulaEngine(session.adapted);
  try {
    const mutations = buildMutationsForSliderValues(
      session.baseDomain.sliderControls,
      sliderValues,
    );
    tempEngine.setInputsBatch(mutations);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(session.adapted.rawBuffer);

    // 1. Nadpisz wyłącznie komórki wejściowe (nigdy formuły!)
    for (const mut of mutations) {
      const posKey = cellPositionKey(mut.coord.sheet, mut.coord.row, mut.coord.col);
      if (session.adapted.formulaPositions.has(posKey)) {
        throw new Error(
          `Eksport zablokowany: próba nadpisania komórki z formułą (${mut.coord.sheet}!R${mut.coord.row + 1}C${mut.coord.col + 1}).`,
        );
      }
      const ws = wb.getWorksheet(mut.coord.sheet);
      if (!ws) continue;
      ws.getCell(mut.coord.row + 1, mut.coord.col + 1).value = mut.value;
    }

    // 2. Zaktualizuj cache <v> dla każdej komórki formułowej z zachowaniem oryginalnej formuły / sharedFormula
    for (const fc of session.adapted.formulaCells) {
      const ws = wb.getWorksheet(fc.sheet);
      if (!ws) continue;
      const cell = ws.getCell(fc.row + 1, fc.col + 1);
      const rawVal = cell.value as unknown;
      const valObj =
        rawVal && typeof rawVal === 'object' ? (rawVal as ExcelFormulaValueShape) : null;
      const modelObj = (cell as unknown as { model?: ExcelFormulaValueShape }).model;

      const evaluated = tempEngine.getCellValue({
        sheet: fc.sheet,
        row: fc.row,
        col: fc.col,
      });
      const result: string | number | boolean | undefined =
        !isDetailedCellError(evaluated) && evaluated !== null ? evaluated : undefined;

      const sharedMaster = valObj?.sharedFormula ?? modelObj?.sharedFormula;
      const ownFormula = valObj?.formula ?? modelObj?.formula;

      if (sharedMaster && !ownFormula) {
        cell.value = (
          result !== undefined ? { sharedFormula: sharedMaster, result } : { sharedFormula: sharedMaster }
        ) as ExcelJS.CellValue;
      } else {
        const formulaText = ownFormula ?? fc.formula;
        const shareType = valObj?.shareType ?? modelObj?.shareType;
        const ref = valObj?.ref ?? modelObj?.ref;
        const payload: ExcelFormulaValueShape = { formula: formulaText };
        if (shareType) payload.shareType = shareType;
        if (ref) payload.ref = ref;
        if (result !== undefined) payload.result = result;
        cell.value = payload as ExcelJS.CellValue;
      }
    }

    // 3. Opcjonalna zakładka porównawcza Side-by-Side
    if (includeComparisonSheet && comparisonScenarios && comparisonScenarios.length > 0) {
      appendComparisonWorksheet(wb, comparisonScenarios, session, scenarioName);
    }

    // 4. Wymuś pełne przeliczenie po otwarciu w Excelu
    wb.calcProperties = { fullCalcOnLoad: true };

    const out = await wb.xlsx.writeBuffer();
    return new Uint8Array(out as ArrayBuffer);
  } finally {
    tempEngine.destroy();
  }
}

export function buildExportFileName(sourceFileName: string, scenarioName: string): string {
  const baseName = sourceFileName.replace(/\.xlsx$/i, '').trim() || 'FinPulse_Model';
  const polishMap: Record<string, string> = {
    ą: 'a',
    ć: 'c',
    ę: 'e',
    ł: 'l',
    ń: 'n',
    ó: 'o',
    ś: 's',
    ź: 'z',
    ż: 'z',
    Ą: 'A',
    Ć: 'C',
    Ę: 'E',
    Ł: 'L',
    Ń: 'N',
    Ó: 'O',
    Ś: 'S',
    Ź: 'Z',
    Ż: 'Z',
  };
  const safeScenario = scenarioName
    .split('')
    .map((ch) => polishMap[ch] ?? ch)
    .join('')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Scenariusz';

  return `${baseName}_${safeScenario}.xlsx`;
}

export function downloadXlsxBuffer(bytes: Uint8Array, fileName: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
