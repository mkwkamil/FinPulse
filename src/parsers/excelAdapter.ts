import ExcelJS from 'exceljs';
import type { ParsedA1Range } from '@/types/contract';
import type { FormulaSyntaxWarning } from '@/types/audit';
import { detectUnsupportedSyntax, normalizeFormulaForHF } from './formulaSanitizer';
import { parseA1Range, resolveSharedFormula } from './sharedFormulaResolver';

export type CellScalarValue = string | number | boolean | null;

export interface FormulaCellRecord {
  sheet: string;
  /** 0-based row */
  row: number;
  /** 0-based col */
  col: number;
  address: string;
  formula: string;
  excelCachedResult: CellScalarValue | undefined;
}

export interface AdaptedWorkbook {
  fileName: string;
  /** Oryginalny niemutowalny bufor .xlsx (zachowywany do eksportu) */
  rawBuffer: ArrayBuffer;
  date1904: boolean;
  sheetNames: string[];
  sheetsData: Record<string, CellScalarValue[][]>;
  /** Klucz: `${sheet}\0${row}\0${col}` (0-based) */
  formulaPositions: Set<string>;
  formulaCells: FormulaCellRecord[];
  syntaxWarnings: FormulaSyntaxWarning[];
  namedRanges: Map<string, ParsedA1Range>;
  rawNamedExpressions: Map<string, string>;
}

export function cellPositionKey(sheet: string, row: number, col: number): string {
  return `${sheet}\0${row}\0${col}`;
}

export function validateZipSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

function toArrayBuffer(input: ArrayBuffer | Uint8Array): ArrayBuffer {
  if (input instanceof ArrayBuffer) {
    return input.slice(0);
  }
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

function dateToExcelSerial(date: Date, date1904: boolean): number {
  const epochMs = date1904
    ? Date.UTC(1904, 0, 1)
    : Date.UTC(1899, 11, 30);
  const utcMs = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds(),
  );
  return (utcMs - epochMs) / 86_400_000;
}

function toScalarValue(raw: unknown, date1904: boolean): CellScalarValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  if (typeof raw === 'string' || typeof raw === 'boolean') return raw;
  if (raw instanceof Date) return dateToExcelSerial(raw, date1904);
  if (typeof raw === 'object') {
    const obj = raw as {
      richText?: Array<{ text: string }>;
      text?: string;
      error?: string;
    };
    if (Array.isArray(obj.richText)) {
      return obj.richText.map((r) => r.text).join('');
    }
    if (typeof obj.text === 'string') return obj.text;
    if (typeof obj.error === 'string') return obj.error;
  }
  return String(raw);
}

function extractFormulaCachedResult(
  cell: ExcelJS.Cell,
  date1904: boolean,
): CellScalarValue | undefined {
  // KRYTYCZNE: używamy cell.result (nie cell.value.result), ponieważ ExcelJS._copyModel pomija 0 i false!
  const rawResult = cell.result as unknown;
  if (rawResult === undefined || rawResult === null) return undefined;
  return toScalarValue(rawResult, date1904);
}

export async function loadWorkbookFromBuffer(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'model.xlsx',
): Promise<AdaptedWorkbook> {
  const rawBuffer = toArrayBuffer(buffer);
  const bytes = new Uint8Array(rawBuffer);
  if (!validateZipSignature(bytes)) {
    throw new Error(
      `Plik "${fileName}" nie ma prawidłowej sygnatury ZIP/XLSX (PK\\x03\\x04).`,
    );
  }

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(rawBuffer);

  const date1904 = Boolean((wb.properties as { date1904?: boolean } | undefined)?.date1904);
  const sheetNames: string[] = [];
  const sheetsData: Record<string, CellScalarValue[][]> = {};
  const formulaPositions = new Set<string>();
  const formulaCells: FormulaCellRecord[] = [];
  const syntaxWarnings: FormulaSyntaxWarning[] = [];

  wb.eachSheet((ws) => {
    sheetNames.push(ws.name);
    const maxRow = ws.rowCount;
    const maxCol = ws.columnCount;

    // Przebieg 1: zbierz wszystkie formuły wzorcowe (master) na tym arkuszu
    const masterFormulas = new Map<string, string>();
    ws.eachRow({ includeEmpty: false }, (row) => {
      row.eachCell({ includeEmpty: false }, (cell) => {
        const val = cell.value;
        if (val && typeof val === 'object' && 'formula' in val && typeof val.formula === 'string') {
          masterFormulas.set(cell.address, val.formula);
        }
      });
    });

    const matrix: CellScalarValue[][] = [];
    for (let r = 1; r <= maxRow; r++) {
      const rowArr: CellScalarValue[] = [];
      for (let c = 1; c <= maxCol; c++) {
        const cell = ws.getCell(r, c);
        const val = cell.value;
        const valObj =
          val && typeof val === 'object'
            ? (val as { formula?: string; sharedFormula?: string })
            : null;
        const modelObj = (cell as unknown as {
          model?: { formula?: string; sharedFormula?: string };
        }).model;

        const isFormula =
          cell.type === ExcelJS.ValueType.Formula ||
          Boolean(valObj?.formula) ||
          Boolean(valObj?.sharedFormula) ||
          Boolean(modelObj?.sharedFormula);

        if (isFormula) {
          let rawFormula = valObj?.formula ?? modelObj?.formula;
          const sharedMasterAddr = valObj?.sharedFormula ?? modelObj?.sharedFormula;

          if (!rawFormula && sharedMasterAddr) {
            const master = masterFormulas.get(sharedMasterAddr);
            if (master) {
              rawFormula = resolveSharedFormula(master, sharedMasterAddr, cell.address);
            } else if (cell.formula) {
              rawFormula = cell.formula;
            }
          } else if (!rawFormula && cell.formula) {
            rawFormula = cell.formula;
          }

          if (rawFormula) {
            const normalized = normalizeFormulaForHF(rawFormula);
            const fullAddr = `${ws.name}!${cell.address}`;
            syntaxWarnings.push(...detectUnsupportedSyntax(normalized, fullAddr));

            rowArr.push(normalized);
            formulaPositions.add(cellPositionKey(ws.name, r - 1, c - 1));
            formulaCells.push({
              sheet: ws.name,
              row: r - 1,
              col: c - 1,
              address: fullAddr,
              formula: normalized,
              excelCachedResult: extractFormulaCachedResult(cell, date1904),
            });
            continue;
          }
        }

        rowArr.push(toScalarValue(val, date1904));
      }
      matrix.push(rowArr);
    }

    sheetsData[ws.name] = matrix;
  });

  const namedRanges = new Map<string, ParsedA1Range>();
  const rawNamedExpressions = new Map<string, string>();
  const definedModel =
    (wb.definedNames?.model as Array<{ name: string; ranges: string[] }> | undefined) ?? [];

  for (const def of definedModel) {
    if (!def.name || def.name.startsWith('_xlnm.')) continue;
    if (!def.ranges || def.ranges.length === 0) continue;
    const rangeStr = def.ranges[0];
    if (!rangeStr || rangeStr.includes('#REF!')) continue;
    try {
      const parsed = parseA1Range(rangeStr);
      namedRanges.set(def.name, parsed);
      rawNamedExpressions.set(def.name, rangeStr.startsWith('=') ? rangeStr : `=${rangeStr}`);
    } catch {
      // Pomijamy niestandardowe nazwy niebędące zakresami A1 (np. stałe tekstowe z innych plików)
    }
  }

  return {
    fileName,
    rawBuffer,
    date1904,
    sheetNames,
    sheetsData,
    formulaPositions,
    formulaCells,
    syntaxWarnings,
    namedRanges,
    rawNamedExpressions,
  };
}
