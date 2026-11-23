import type { ParsedA1Range } from '@/types/contract';
import { splitFormulaQuotedSegments } from './formulaSanitizer';

const MAX_EXCEL_COL = 16383; // XFD (0-based)
const MAX_EXCEL_ROW = 1048575; // 1048576 (0-based)

export function colToZeroIdx(colStr: string): number {
  let n = 0;
  const upper = colStr.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    n = n * 26 + (upper.charCodeAt(i) - 64);
  }
  return n - 1;
}

export function zeroIdxToCol(colIdx: number): string {
  let n = colIdx + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

export interface ParsedA1Cell {
  col: number; // 0-based
  row: number; // 0-based
  absCol: boolean;
  absRow: boolean;
}

export function parseA1Cell(cellRef: string): ParsedA1Cell {
  const m = /^(\$?)([A-Z]{1,3})(\$?)(\d{1,7})$/i.exec(cellRef.trim());
  if (!m) {
    throw new Error(`Nieprawidłowy adres komórki A1: "${cellRef}"`);
  }
  return {
    absCol: m[1] === '$',
    col: colToZeroIdx(m[2]),
    absRow: m[3] === '$',
    row: Number(m[4]) - 1,
  };
}

export function parseA1Range(refStr: string): ParsedA1Range {
  const clean = refStr.trim().replace(/^=/, '');
  const bangIdx = clean.lastIndexOf('!');
  if (bangIdx < 0) {
    throw new Error(`Zakres nazwany nie zawiera nazwy arkusza: "${refStr}"`);
  }
  const sheet = clean
    .slice(0, bangIdx)
    .replace(/^'(.*)'$/, '$1')
    .replace(/''/g, "'");
  const coords = clean.slice(bangIdx + 1).trim();
  const [startPart, endPart] = coords.split(':');
  const s = parseA1Cell(startPart);
  const e = endPart ? parseA1Cell(endPart) : s;

  return {
    sheet,
    r1: Math.min(s.row, e.row),
    c1: Math.min(s.col, e.col),
    r2: Math.max(s.row, e.row),
    c2: Math.max(s.col, e.col),
  };
}

const CELL_CANDIDATE_RE = /(\$?)([A-Za-z]{1,3})(\$?)(\d{1,7})/g;

function isIdentChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_.]/.test(ch);
}

function isTrailingIdentOrCallChar(ch: string | undefined): boolean {
  return ch !== undefined && /[A-Za-z0-9_.(!]/.test(ch);
}

function shiftUnquotedSegment(segment: string, dCol: number, dRow: number): string {
  return segment.replace(
    CELL_CANDIDATE_RE,
    (full, absColMark: string, colPart: string, absRowMark: string, rowPart: string, offset: number) => {
      const prevChar = offset > 0 ? segment[offset - 1] : undefined;
      const nextChar = segment[offset + full.length];

      // Odrzuć identyfikatory i nazwy (np. CFG_Q4_SHARE, LOG10(, Sheet1!, BO_AR_B2B)
      if (isIdentChar(prevChar) || isTrailingIdentOrCallChar(nextChar)) {
        return full;
      }

      const colIdx = colToZeroIdx(colPart);
      const rowIdx = Number(rowPart) - 1;
      if (colIdx < 0 || colIdx > MAX_EXCEL_COL || rowIdx < 0 || rowIdx > MAX_EXCEL_ROW) {
        return full;
      }

      const newCol = absColMark === '$' ? colIdx : colIdx + dCol;
      const newRow = absRowMark === '$' ? rowIdx : rowIdx + dRow;

      if (newCol < 0 || newCol > MAX_EXCEL_COL || newRow < 0 || newRow > MAX_EXCEL_ROW) {
        return '#REF!';
      }

      return `${absColMark}${zeroIdxToCol(newCol)}${absRowMark}${newRow + 1}`;
    },
  );
}

/**
 * Rozwija formułę współdzieloną (shared formula) z komórki wzorcowej na docelową,
 * zachowując kotwice '$', literały tekstowe, cytowane arkusze i Named Ranges.
 */
export function resolveSharedFormula(
  masterFormula: string,
  masterAddr: string,
  slaveAddr: string,
): string {
  const master = parseA1Cell(masterAddr);
  const slave = parseA1Cell(slaveAddr);
  const dCol = slave.col - master.col;
  const dRow = slave.row - master.row;

  if (dCol === 0 && dRow === 0) {
    return masterFormula;
  }

  return splitFormulaQuotedSegments(masterFormula)
    .map((seg) => (seg.isQuoted ? seg.text : shiftUnquotedSegment(seg.text, dCol, dRow)))
    .join('');
}
