import type { AdaptedWorkbook } from '@/parsers/excelAdapter';
import type { EngineCellValue, IFormulaEngine } from '@/engine/formulaEngine';
import { isDetailedCellError } from '@/engine/formulaEngine';
import {
  CONTRACT_VERSION,
  OPTIONAL_NAMED_RANGES,
  REQUIRED_NAMED_RANGES,
  REQUIRED_SHEETS,
} from '@/types/contract';
import type {
  AuditGateResult,
  AuditSeverity,
  ContractDiagnostic,
  ModelAuditReport,
  ParityMismatch,
} from '@/types/audit';
import type { FinancialDomainModel } from '@/types/financial';

const DEFAULT_PLN_TOLERANCE = 0.01;

function maxSeverity(severities: AuditSeverity[]): AuditSeverity {
  if (severities.includes('CRITICAL')) return 'CRITICAL';
  if (severities.includes('WARNING')) return 'WARNING';
  if (severities.includes('INFO')) return 'INFO';
  return 'OK';
}

function toNumberArray(values: EngineCellValue[]): number[] {
  return values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
}

function maxAbs(values: number[]): number {
  return values.reduce((mx, v) => Math.max(mx, Math.abs(v)), 0);
}

export function auditContract(
  adapted: AdaptedWorkbook,
  engine?: IFormulaEngine,
): ContractDiagnostic {
  const sheetSet = new Set(adapted.sheetNames);
  const missingSheets = REQUIRED_SHEETS.filter((s) => !sheetSet.has(s));
  const missingNamedRanges = REQUIRED_NAMED_RANGES.filter(
    (nr) => !adapted.namedRanges.has(nr),
  );
  const optionalMissingRanges = OPTIONAL_NAMED_RANGES.filter(
    (nr) => !adapted.namedRanges.has(nr),
  );

  // Wykrywanie starego modelu BETA (komunikat diagnostyczny bez utrzymywania starych adresów)
  const legacyMarkers = ['Założenia', 'Alok_Klucze', 'Alok_Macierz', 'RZiS', 'Bilans'];
  const legacyMatches = legacyMarkers.filter((m) => sheetSet.has(m)).length;
  const isLegacyBetaCandidate =
    missingSheets.includes('00_Konfiguracja_UI') && legacyMatches >= 3;

  let schemaVersion: string | null = null;
  if (engine && adapted.namedRanges.has('META_SCHEMA_VERSION')) {
    const raw = engine.getNamedScalar('META_SCHEMA_VERSION');
    if (raw !== null && raw !== undefined && !isDetailedCellError(raw)) {
      const s = String(raw).trim();
      schemaVersion = s === '1' ? '1.0' : s;
    }
  }

  const versionMismatch =
    schemaVersion !== null && schemaVersion !== CONTRACT_VERSION;

  const valid =
    missingSheets.length === 0 &&
    missingNamedRanges.length === 0 &&
    !versionMismatch;

  let diagnosticMessage: string | null = null;
  if (!valid) {
    if (isLegacyBetaCandidate) {
      diagnosticMessage =
        'Wykryto starszy układ modelu BETA (bez arkusza 00_Konfiguracja_UI i Nazwanych Zakresów). Aplikacja wymaga Kontraktu Danych v1.0 — użyj wbudowanego wzorca Budzet_BETA_v2_Standard.xlsx lub przenieś założenia do nowego szablonu.';
    } else if (versionMismatch) {
      diagnosticMessage = `Niezgodna wersja schematu pliku: "${schemaVersion}" (oczekiwano "${CONTRACT_VERSION}").`;
    } else {
      const parts: string[] = [];
      if (missingSheets.length > 0) {
        parts.push(`brakujące zakładki (${missingSheets.join(', ')})`);
      }
      if (missingNamedRanges.length > 0) {
        parts.push(`brakujące Nazwane Zakresy (${missingNamedRanges.slice(0, 8).join(', ')}${missingNamedRanges.length > 8 ? '…' : ''})`);
      }
      diagnosticMessage = `Plik nie spełnia Kontraktu Danych v1.0: ${parts.join('; ')}.`;
    }
  }

  return {
    valid,
    schemaVersion,
    missingSheets,
    missingNamedRanges,
    optionalMissingRanges,
    isLegacyBetaCandidate,
    diagnosticMessage,
  };
}

export interface ZeroPointSnapshotEntry {
  lineCode: string;
  value: number | null;
}

export function auditWorkbook(
  adapted: AdaptedWorkbook,
  engine: IFormulaEngine,
  domain: FinancialDomainModel | null,
  baseZeroSnapshot?: ZeroPointSnapshotEntry[],
): ModelAuditReport {
  const contract = auditContract(adapted, engine);

  // Bramka 1: Kontrakt i składnia formuł
  const gate1Details: string[] = [];
  if (contract.diagnosticMessage) {
    gate1Details.push(contract.diagnosticMessage);
  }
  if (adapted.syntaxWarnings.length > 0) {
    gate1Details.push(
      `Wykryto ${adapted.syntaxWarnings.length} ostrzeżeń składniowych formuł (np. ${adapted.syntaxWarnings[0].address}: ${adapted.syntaxWarnings[0].tokens.join(', ')}).`,
    );
  }
  const gate1Status: AuditSeverity = !contract.valid
    ? 'CRITICAL'
    : adapted.syntaxWarnings.length > 0
      ? 'WARNING'
      : contract.optionalMissingRanges.length > 0
        ? 'INFO'
        : 'OK';

  // Bramka 2: Parzystość Excel cache vs HyperFormula + błędy formuł
  const formulaErrors = engine.getAllFormulaErrors();
  const mismatches: ParityMismatch[] = [];
  let checkedCachedCount = 0;

  for (const fc of adapted.formulaCells) {
    if (fc.excelCachedResult === undefined) continue;
    checkedCachedCount++;
    const hfVal = engine.getCellValue({ sheet: fc.sheet, row: fc.row, col: fc.col });
    if (isDetailedCellError(hfVal)) {
      mismatches.push({
        address: fc.address,
        formula: fc.formula,
        excelCached: fc.excelCachedResult,
        hyperformulaValue: String(hfVal.value),
        diff: null,
      });
      continue;
    }

    if (typeof fc.excelCachedResult === 'number' && typeof hfVal === 'number') {
      const diff = Math.abs(fc.excelCachedResult - hfVal);
      const tol = Math.max(DEFAULT_PLN_TOLERANCE, 1e-6 * Math.abs(fc.excelCachedResult));
      if (diff > tol) {
        mismatches.push({
          address: fc.address,
          formula: fc.formula,
          excelCached: fc.excelCachedResult,
          hyperformulaValue: hfVal,
          diff,
        });
      }
    } else if (fc.excelCachedResult !== hfVal) {
      mismatches.push({
        address: fc.address,
        formula: fc.formula,
        excelCached: fc.excelCachedResult,
        hyperformulaValue: hfVal,
        diff: null,
      });
    }
  }

  const gate2Details: string[] = [];
  if (formulaErrors.length > 0) {
    gate2Details.push(
      ...formulaErrors
        .slice(0, 5)
        .map((e) => `${e.address}: ${e.errorValue} (${e.message || e.formula})`),
    );
  }
  if (mismatches.length > 0) {
    gate2Details.push(
      ...mismatches
        .slice(0, 5)
        .map(
          (m) =>
            `${m.address}: Excel=${String(m.excelCached)} vs HF=${String(m.hyperformulaValue)}`,
        ),
    );
  }
  const gate2Status: AuditSeverity =
    formulaErrors.length > 0 || mismatches.length > 0
      ? 'CRITICAL'
      : checkedCachedCount === 0 && adapted.formulaCells.length > 0
        ? 'INFO'
        : 'OK';

  // Bramka 3: Równowaga księgowa 3 sprawozdań
  let maxBalanceDiff = 0;
  let maxCfVsBsDiff = 0;
  let maxAllocVsPlDiff = 0;
  let maxMatrixRowDeviation = 0;

  if (engine.hasNamedRange('ROW_BS_CHECK')) {
    maxBalanceDiff = maxAbs(toNumberArray(engine.getNamedMatrix('ROW_BS_CHECK')[0] ?? []));
  }
  if (engine.hasNamedRange('ROW_CF_CHECK')) {
    maxCfVsBsDiff = maxAbs(toNumberArray(engine.getNamedMatrix('ROW_CF_CHECK')[0] ?? []));
  }
  if (engine.hasNamedRange('ROW_ALLOC_DIFF')) {
    maxAllocVsPlDiff = maxAbs(toNumberArray(engine.getNamedMatrix('ROW_ALLOC_DIFF')[0] ?? []));
  }
  if (engine.hasNamedRange('COL_ALLOC_ROW_SUMS')) {
    const sums = engine.getNamedMatrix('COL_ALLOC_ROW_SUMS').map((r) =>
      typeof r[0] === 'number' ? r[0] : 1,
    );
    maxMatrixRowDeviation = sums.reduce((mx, s) => Math.max(mx, Math.abs(s - 1)), 0);
  }

  const gate3Details: string[] = [];
  if (maxBalanceDiff > DEFAULT_PLN_TOLERANCE) {
    gate3Details.push(`Bilans niezbilansowany: max |Aktywa - Pasywa| = ${maxBalanceDiff.toFixed(2)} PLN.`);
  }
  if (maxCfVsBsDiff > DEFAULT_PLN_TOLERANCE) {
    gate3Details.push(`Rozbieżność CF vs Bilans: max |Δ gotówki| = ${maxCfVsBsDiff.toFixed(2)} PLN.`);
  }
  if (maxAllocVsPlDiff > DEFAULT_PLN_TOLERANCE) {
    gate3Details.push(`Rozbieżność alokacji działowej vs RZiS: ${maxAllocVsPlDiff.toFixed(2)} PLN.`);
  }
  if (maxMatrixRowDeviation > 1e-4) {
    gate3Details.push(`Wiersze macierzy alokacji nie sumują się do 100% (odchylenie ${(maxMatrixRowDeviation * 100).toFixed(2)} pp).`);
  }
  const gate3Status: AuditSeverity = !contract.valid
    ? 'INFO'
    : gate3Details.length > 0
      ? 'CRITICAL'
      : 'OK';

  // Bramka 4: Niezmienność Momentu Zero
  let zeroPointLocked = true;
  const zeroPointDrifts: string[] = [];
  if (domain && baseZeroSnapshot) {
    for (const snap of baseZeroSnapshot) {
      const curRow = domain.bs.byCode[snap.lineCode];
      if (!curRow) {
        zeroPointLocked = false;
        zeroPointDrifts.push(`Brak pozycji ${snap.lineCode} w Bilansie.`);
        continue;
      }
      if (snap.value !== null && curRow.zeroValue !== null) {
        if (Math.abs(curRow.zeroValue - snap.value) > DEFAULT_PLN_TOLERANCE) {
          zeroPointLocked = false;
          zeroPointDrifts.push(
            `${snap.lineCode}: BO=${snap.value.toFixed(2)} zmieniło się na ${curRow.zeroValue.toFixed(2)}`,
          );
        }
      } else if (snap.value !== curRow.zeroValue) {
        zeroPointLocked = false;
        zeroPointDrifts.push(`${snap.lineCode}: niezgodność typu Momentu Zero`);
      }
    }
  } else if (!contract.valid) {
    zeroPointLocked = false;
  }

  const gate4Status: AuditSeverity = !contract.valid
    ? 'INFO'
    : zeroPointLocked
      ? 'OK'
      : 'CRITICAL';

  // Bramka 5: Kowenanty i płynność
  const overdraftSeries = domain?.overdraftSeries ?? [];
  const slSeries = domain?.shareholderLoanSeries ?? [];
  const cashSeries = domain?.bs.byCode.BS_CASH?.months ?? [];
  const eqSeries = domain?.bs.byCode.BS_EQUITY?.months ?? [];
  const curRatioSeries = domain?.ratios.byCode.RT_CURRENT_RATIO?.months ?? [];

  const maxOverdraft = overdraftSeries.length > 0 ? Math.max(...overdraftSeries) : 0;
  const overdraftLimit = domain?.config.overdraftLimit ?? 0;
  const maxOverdraftUtilization = overdraftLimit > 0 ? maxOverdraft / overdraftLimit : 0;
  const maxShareholderLoan = slSeries.length > 0 ? Math.max(...slSeries) : 0;
  const minCash = cashSeries.length > 0 ? Math.min(...cashSeries) : 0;
  const minCashThreshold = domain?.config.minCash ?? 0;
  const minEquity = eqSeries.length > 0 ? Math.min(...eqSeries) : 0;
  const minCurrentRatio = curRatioSeries.length > 0 ? Math.min(...curRatioSeries) : 0;

  const gate5Details: string[] = [];
  const gate5Severities: AuditSeverity[] = [contract.valid ? 'OK' : 'INFO'];

  if (domain) {
    if (overdraftLimit > 0 && maxOverdraft > overdraftLimit + DEFAULT_PLN_TOLERANCE) {
      gate5Severities.push('CRITICAL');
      gate5Details.push(
        `Przekroczony limit overdraftu (${maxOverdraft.toFixed(0)} > ${overdraftLimit.toFixed(0)}).`,
      );
    } else if (overdraftLimit > 0 && maxOverdraftUtilization > 0.85) {
      gate5Severities.push('WARNING');
      gate5Details.push(
        `Wysokie wykorzystanie limitu overdraftu: ${(maxOverdraftUtilization * 100).toFixed(1)}%.`,
      );
    }

    if (maxShareholderLoan > DEFAULT_PLN_TOLERANCE) {
      gate5Severities.push('WARNING');
      gate5Details.push(
        `Uruchomiona awaryjna pożyczka wspólników: szczyt ${maxShareholderLoan.toFixed(0)} ${domain.metadata.currency}.`,
      );
    }

    if (cashSeries.length > 0 && minCash < minCashThreshold - DEFAULT_PLN_TOLERANCE) {
      gate5Severities.push('WARNING');
      gate5Details.push(
        `Gotówka spadła poniżej bufora minimalnego (${minCash.toFixed(0)} < ${minCashThreshold.toFixed(0)}).`,
      );
    }

    if (eqSeries.length > 0 && minEquity < 0) {
      gate5Severities.push('CRITICAL');
      gate5Details.push(`Ujemny kapitał własny w okresie (min ${minEquity.toFixed(0)}).`);
    }

    if (curRatioSeries.length > 0 && minCurrentRatio < 1.0) {
      gate5Severities.push('WARNING');
      gate5Details.push(`Płynność bieżąca poniżej 1,00x (min ${minCurrentRatio.toFixed(2)}x).`);
    }
  }

  const gate5Status = maxSeverity(gate5Severities);

  const gates: AuditGateResult[] = [
    {
      gateId: 'GATE_1_CONTRACT',
      title: 'Bramka 1: Zgodność Kontraktu Danych v1.0',
      status: gate1Status,
      summary: contract.valid
        ? `Kontrakt v${contract.schemaVersion ?? CONTRACT_VERSION} poprawny (${adapted.sheetNames.length} zakładek, ${adapted.namedRanges.size} Nazwanych Zakresów)`
        : contract.diagnosticMessage ?? 'Niezgodny schemat pliku',
      details: gate1Details,
    },
    {
      gateId: 'GATE_2_ENGINE_PARITY',
      title: 'Bramka 2: Parzystość Excel Cache vs HyperFormula',
      status: gate2Status,
      summary:
        gate2Status === 'OK'
          ? `100% zgodności obliczeniowej (${checkedCachedCount} / ${adapted.formulaCells.length} formuł)`
          : gate2Status === 'INFO'
            ? `Przeliczono ${adapted.formulaCells.length} formuł (brak zapisanego cache w pliku)`
            : `Wykryto ${formulaErrors.length} błędów formuł i ${mismatches.length} rozbieżności cache`,
      details: gate2Details,
    },
    {
      gateId: 'GATE_3_ACCOUNTING_INTEGRITY',
      title: 'Bramka 3: Równowaga księgowa 3 sprawozdań',
      status: gate3Status,
      summary:
        gate3Status === 'OK'
          ? `Aktywa = Pasywa (Δ=${maxBalanceDiff.toFixed(4)}), CF = Bilans (Δ=${maxCfVsBsDiff.toFixed(4)}), Alokacja = RZiS`
          : 'Naruszenie spójności sprawozdań lub macierzy alokacji',
      details: gate3Details,
    },
    {
      gateId: 'GATE_4_ZERO_POINT_LOCK',
      title: 'Bramka 4: Niezmienność Momentu Zero',
      status: gate4Status,
      summary: zeroPointLocked
        ? `Bilans otwarcia (${domain?.metadata.zeroDate ?? 'Moment Zero'}) zablokowany`
        : 'Wykryto zmianę w kolumnie Moment Zero podczas symulacji',
      details: zeroPointDrifts,
    },
    {
      gateId: 'GATE_5_COVENANTS',
      title: 'Bramka 5: Ryzyko płynności i kowenanty',
      status: gate5Status,
      summary:
        gate5Status === 'OK'
          ? `Max overdraft ${(maxOverdraftUtilization * 100).toFixed(1)}% limitu, brak pożyczki wspólników`
          : gate5Details[0] ?? 'Wymaga uwagi CFO',
      details: gate5Details,
    },
  ];

  const overallStatus = maxSeverity(gates.map((g) => g.status));

  return {
    overallStatus,
    auditedAt: new Date().toISOString(),
    contract,
    gates,
    parity: {
      totalFormulaCells: adapted.formulaCells.length,
      checkedCachedCount,
      mismatchCount: mismatches.length,
      mismatches,
      formulaErrors,
      syntaxWarnings: adapted.syntaxWarnings,
    },
    integrity: {
      maxBalanceDiff,
      maxCfVsBsDiff,
      maxAllocVsPlDiff,
      maxMatrixRowDeviation,
      zeroPointLocked,
      zeroPointDrifts,
    },
    covenants: {
      maxOverdraft,
      overdraftLimit,
      maxOverdraftUtilization,
      maxShareholderLoan,
      minCash,
      minCashThreshold,
      minEquity,
      minCurrentRatio,
    },
  };
}
