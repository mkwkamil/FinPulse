export type AuditSeverity = 'OK' | 'INFO' | 'WARNING' | 'CRITICAL';

export interface ParityMismatch {
  address: string;
  formula: string;
  excelCached: number | string | boolean | null;
  hyperformulaValue: number | string | boolean | null;
  diff: number | null;
}

export interface FormulaErrorEntry {
  address: string;
  formula: string;
  errorValue: string;
  message: string;
}

export interface FormulaSyntaxWarning {
  address: string;
  formula: string;
  reason: 'STRUCTURED_REF' | 'VOLATILE_FN' | 'UNSUPPORTED_O365_FN';
  tokens: string[];
}

export interface ContractDiagnostic {
  valid: boolean;
  schemaVersion: string | null;
  missingSheets: string[];
  missingNamedRanges: string[];
  optionalMissingRanges: string[];
  isLegacyBetaCandidate: boolean;
  diagnosticMessage: string | null;
}

export interface AuditGateResult {
  gateId:
    | 'GATE_1_CONTRACT'
    | 'GATE_2_ENGINE_PARITY'
    | 'GATE_3_ACCOUNTING_INTEGRITY'
    | 'GATE_4_ZERO_POINT_LOCK'
    | 'GATE_5_COVENANTS';
  title: string;
  status: AuditSeverity;
  summary: string;
  details: string[];
}

export interface ModelAuditReport {
  overallStatus: AuditSeverity;
  auditedAt: string;
  contract: ContractDiagnostic;
  gates: AuditGateResult[];
  parity: {
    totalFormulaCells: number;
    checkedCachedCount: number;
    mismatchCount: number;
    mismatches: ParityMismatch[];
    formulaErrors: FormulaErrorEntry[];
    syntaxWarnings: FormulaSyntaxWarning[];
  };
  integrity: {
    maxBalanceDiff: number;
    maxCfVsBsDiff: number;
    maxAllocVsPlDiff: number;
    maxMatrixRowDeviation: number;
    zeroPointLocked: boolean;
    zeroPointDrifts: string[];
  };
  covenants: {
    maxOverdraft: number;
    overdraftLimit: number;
    maxOverdraftUtilization: number;
    maxShareholderLoan: number;
    minCash: number;
    minCashThreshold: number;
    minEquity: number;
    minCurrentRatio: number;
  };
}
