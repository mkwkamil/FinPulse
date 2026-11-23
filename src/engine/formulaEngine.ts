import { DetailedCellError, HyperFormula } from 'hyperformula';
import type { AdaptedWorkbook, CellScalarValue } from '@/parsers/excelAdapter';
import { cellPositionKey, loadWorkbookFromBuffer } from '@/parsers/excelAdapter';
import { extractDomainModel } from '@/parsers/domainExtractor';
import { auditWorkbook } from './modelAuditor';
import type { CellCoordinate, ParsedA1Range } from '@/types/contract';
import type { FinancialDomainModel } from '@/types/financial';
import type { FormulaErrorEntry, ModelAuditReport } from '@/types/audit';

export type EngineCellValue = CellScalarValue | DetailedCellError;

export interface EngineCellMutation {
  coord: CellCoordinate;
  value: number | string | boolean;
}

export interface IFormulaEngine {
  getCellValue(coord: CellCoordinate): EngineCellValue;
  getNamedScalar(name: string): EngineCellValue;
  getNamedMatrix(name: string): EngineCellValue[][];
  getRangeMatrix(range: ParsedA1Range): EngineCellValue[][];
  getNamedRange(name: string): ParsedA1Range | undefined;
  hasNamedRange(name: string): boolean;
  isFormulaCell(coord: CellCoordinate): boolean;
  setInputsBatch(mutations: EngineCellMutation[]): void;
  resetToBaseline(): void;
  getAllFormulaErrors(): FormulaErrorEntry[];
  destroy(): void;
}

export function isDetailedCellError(value: unknown): value is DetailedCellError {
  if (value instanceof DetailedCellError) return true;
  if (typeof value === 'object' && value !== null && 'type' in value && 'value' in value) {
    const v = (value as { value: unknown }).value;
    return typeof v === 'string' && v.startsWith('#');
  }
  return false;
}

function normalizeHfValue(raw: unknown): EngineCellValue {
  if (raw === null || raw === undefined) return null;
  if (isDetailedCellError(raw)) return raw;
  if (typeof raw === 'number' || typeof raw === 'string' || typeof raw === 'boolean') {
    return raw;
  }
  return String(raw);
}

export class HyperFormulaEngine implements IFormulaEngine {
  private readonly hf: HyperFormula;
  private readonly adapted: AdaptedWorkbook;
  private readonly sheetIdMap = new Map<string, number>();
  private readonly baselineValues = new Map<string, { coord: CellCoordinate; value: CellScalarValue }>();

  constructor(adapted: AdaptedWorkbook) {
    this.adapted = adapted;
    this.hf = HyperFormula.buildFromSheets(adapted.sheetsData, {
      licenseKey: 'gpl-v3',
      leapYear1900: !adapted.date1904,
      nullDate: adapted.date1904
        ? { year: 1904, month: 1, day: 1 }
        : { year: 1899, month: 12, day: 30 },
    });

    for (const [name, expr] of adapted.rawNamedExpressions.entries()) {
      try {
        this.hf.addNamedExpression(name, expr);
      } catch {
        // Błędne lub nieobsługiwane nazwy nie blokują załadowania silnika; zostaną zgłoszone przez Audytora
      }
    }

    for (const name of this.hf.getSheetNames()) {
      const id = this.hf.getSheetId(name);
      if (id !== undefined) {
        this.sheetIdMap.set(name, id);
      }
    }
  }

  private getSheetId(sheetName: string): number {
    const id = this.sheetIdMap.get(sheetName);
    if (id === undefined) {
      throw new Error(`Arkusz "${sheetName}" nie istnieje w instancji HyperFormula.`);
    }
    return id;
  }

  getCellValue(coord: CellCoordinate): EngineCellValue {
    const sheet = this.getSheetId(coord.sheet);
    return normalizeHfValue(
      this.hf.getCellValue({ sheet, row: coord.row, col: coord.col }),
    );
  }

  getNamedRange(name: string): ParsedA1Range | undefined {
    return this.adapted.namedRanges.get(name);
  }

  hasNamedRange(name: string): boolean {
    return this.adapted.namedRanges.has(name);
  }

  getNamedScalar(name: string): EngineCellValue {
    const range = this.adapted.namedRanges.get(name);
    if (!range) {
      throw new Error(`Brak nazwanego zakresu "${name}" w skoroszycie.`);
    }
    return this.getCellValue({ sheet: range.sheet, row: range.r1, col: range.c1 });
  }

  getRangeMatrix(range: ParsedA1Range): EngineCellValue[][] {
    const sheet = this.getSheetId(range.sheet);
    const rows: EngineCellValue[][] = [];
    for (let r = range.r1; r <= range.r2; r++) {
      const rowArr: EngineCellValue[] = [];
      for (let c = range.c1; c <= range.c2; c++) {
        rowArr.push(normalizeHfValue(this.hf.getCellValue({ sheet, row: r, col: c })));
      }
      rows.push(rowArr);
    }
    return rows;
  }

  getNamedMatrix(name: string): EngineCellValue[][] {
    const range = this.adapted.namedRanges.get(name);
    if (!range) {
      throw new Error(`Brak nazwanego zakresu "${name}" w skoroszycie.`);
    }
    return this.getRangeMatrix(range);
  }

  isFormulaCell(coord: CellCoordinate): boolean {
    return this.adapted.formulaPositions.has(
      cellPositionKey(coord.sheet, coord.row, coord.col),
    );
  }

  setInputsBatch(mutations: EngineCellMutation[]): void {
    if (mutations.length === 0) return;

    // KRYTYCZNE: Walidacja przed wejściem do hf.batch() — nigdy nie nadpisujemy formuł!
    const prepared = mutations.map((m) => {
      if (this.isFormulaCell(m.coord)) {
        throw new Error(
          `Zabroniona mutacja komórki z formułą: ${m.coord.sheet}!R${m.coord.row + 1}C${m.coord.col + 1}`,
        );
      }
      const sheetId = this.getSheetId(m.coord.sheet);
      const key = cellPositionKey(m.coord.sheet, m.coord.row, m.coord.col);
      if (!this.baselineValues.has(key)) {
        const cur = this.getCellValue(m.coord);
        this.baselineValues.set(key, {
          coord: m.coord,
          value: isDetailedCellError(cur) ? null : cur,
        });
      }
      return { sheetId, row: m.coord.row, col: m.coord.col, value: m.value };
    });

    this.hf.batch(() => {
      for (const item of prepared) {
        this.hf.setCellContents(
          { sheet: item.sheetId, row: item.row, col: item.col },
          [[item.value]],
        );
      }
    });
  }

  resetToBaseline(): void {
    if (this.baselineValues.size === 0) return;
    const items = [...this.baselineValues.values()].map((entry) => ({
      sheetId: this.getSheetId(entry.coord.sheet),
      row: entry.coord.row,
      col: entry.coord.col,
      value: entry.value,
    }));

    this.hf.batch(() => {
      for (const item of items) {
        this.hf.setCellContents(
          { sheet: item.sheetId, row: item.row, col: item.col },
          [[item.value]],
        );
      }
    });
  }

  getAllFormulaErrors(): FormulaErrorEntry[] {
    const errors: FormulaErrorEntry[] = [];
    for (const fc of this.adapted.formulaCells) {
      const val = this.getCellValue({ sheet: fc.sheet, row: fc.row, col: fc.col });
      if (isDetailedCellError(val)) {
        errors.push({
          address: fc.address,
          formula: fc.formula,
          errorValue: String(val.value),
          message: val.message ?? '',
        });
      }
    }
    return errors;
  }

  destroy(): void {
    this.hf.destroy();
  }
}

export interface FinancialEngineSession {
  adapted: AdaptedWorkbook;
  engine: HyperFormulaEngine;
  baseDomain: FinancialDomainModel | null;
  activeDomain: FinancialDomainModel | null;
  baseAudit: ModelAuditReport;
  activeAudit: ModelAuditReport;
  applyMutations: (mutations: EngineCellMutation[]) => {
    domain: FinancialDomainModel;
    audit: ModelAuditReport;
  };
  reset: () => {
    domain: FinancialDomainModel;
    audit: ModelAuditReport;
  };
  destroy: () => void;
}

export async function createFinancialEngineSession(
  buffer: ArrayBuffer | Uint8Array,
  fileName = 'model.xlsx',
): Promise<FinancialEngineSession> {
  const adapted = await loadWorkbookFromBuffer(buffer, fileName);
  const engine = new HyperFormulaEngine(adapted);

  const initialAudit = auditWorkbook(adapted, engine, null);
  if (!initialAudit.contract.valid) {
    return {
      adapted,
      engine,
      baseDomain: null,
      activeDomain: null,
      baseAudit: initialAudit,
      activeAudit: initialAudit,
      applyMutations: () => {
        throw new Error('Nie można uruchomić symulacji: skoroszyt nie spełnia Kontraktu Danych v1.0.');
      },
      reset: () => {
        throw new Error('Nie można zresetować symulacji: skoroszyt nie spełnia Kontraktu Danych v1.0.');
      },
      destroy: () => engine.destroy(),
    };
  }

  const baseDomain = extractDomainModel(engine, adapted);
  const baseZeroVector = baseDomain.bs.rows.map((r) => ({
    lineCode: r.lineCode,
    value: r.zeroValue,
  }));
  const baseAudit = auditWorkbook(adapted, engine, baseDomain, baseZeroVector);

  let currentDomain = baseDomain;
  let currentAudit = baseAudit;

  return {
    adapted,
    engine,
    baseDomain,
    get activeDomain() {
      return currentDomain;
    },
    baseAudit,
    get activeAudit() {
      return currentAudit;
    },
    applyMutations(mutations) {
      engine.setInputsBatch(mutations);
      currentDomain = extractDomainModel(engine, adapted);
      currentAudit = auditWorkbook(adapted, engine, currentDomain, baseZeroVector);
      return { domain: currentDomain, audit: currentAudit };
    },
    reset() {
      engine.resetToBaseline();
      currentDomain = baseDomain;
      currentAudit = baseAudit;
      return { domain: currentDomain, audit: currentAudit };
    },
    destroy() {
      engine.destroy();
    },
  };
}
