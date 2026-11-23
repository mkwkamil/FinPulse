import type { FormulaSyntaxWarning } from '@/types/audit';

interface FormulaSegment {
  text: string;
  isQuoted: boolean;
}

/**
 * Dzieli formułę na segmenty poza cudzysłowami oraz literały tekstowe / cytowane nazwy arkuszy.
 * Respektuje podwójne znaki ucieczki w Excelu ("" oraz '').
 */
export function splitFormulaQuotedSegments(formula: string): FormulaSegment[] {
  const segments: FormulaSegment[] = [];
  let buf = '';
  let inDouble = false;
  let inSingle = false;

  const flush = (isQuoted: boolean) => {
    if (buf.length > 0) {
      segments.push({ text: buf, isQuoted });
      buf = '';
    }
  };

  for (let i = 0; i < formula.length; i++) {
    const ch = formula[i];
    if (inDouble) {
      buf += ch;
      if (ch === '"') {
        if (formula[i + 1] === '"') {
          buf += formula[++i];
        } else {
          flush(true);
          inDouble = false;
        }
      }
    } else if (inSingle) {
      buf += ch;
      if (ch === "'") {
        if (formula[i + 1] === "'") {
          buf += formula[++i];
        } else {
          flush(true);
          inSingle = false;
        }
      }
    } else if (ch === '"') {
      flush(false);
      buf = ch;
      inDouble = true;
    } else if (ch === "'") {
      flush(false);
      buf = ch;
      inSingle = true;
    } else {
      buf += ch;
    }
  }

  flush(inDouble || inSingle);
  return segments;
}

/**
 * Usuwa prefiksy kompatybilności Excela (_xlfn._xlws., _xlfn.) wyłącznie poza literałami tekstowymi.
 */
export function stripXlfnPrefixes(formula: string): string {
  return splitFormulaQuotedSegments(formula)
    .map((seg) =>
      seg.isQuoted ? seg.text : seg.text.replace(/_xlfn\.(?:_xlws\.)?/gi, ''),
    )
    .join('');
}

/**
 * Zapewnia pojedynczy wiodący znak '=' oraz usuwa prefiksy _xlfn.
 */
export function normalizeFormulaForHF(rawFormula: string): string {
  const trimmed = rawFormula.trim();
  const withEq = trimmed.startsWith('=') ? trimmed : `=${trimmed}`;
  return stripXlfnPrefixes(withEq);
}

const STRUCTURED_REF_RE = /(?:\b[A-Za-z_][A-Za-z0-9_.]*\[[^\]\d][^\]]*\]|\[@[^\]]+\])/g;
const VOLATILE_FN_RE = /\b(OFFSET|INDIRECT|NOW|TODAY|RAND|RANDBETWEEN)\s*\(/gi;
const UNSUPPORTED_O365_FN_RE =
  /\b(XLOOKUP|XMATCH|LET|LAMBDA|FILTER|UNIQUE|SORT|TEXTSPLIT|SCAN|BYROW)\s*\(/gi;

/**
 * Wykrywa konstrukcje niezalecane lub nieobsługiwane przez HyperFormula.
 */
export function detectUnsupportedSyntax(
  formula: string,
  address: string,
): FormulaSyntaxWarning[] {
  const unquoted = splitFormulaQuotedSegments(formula)
    .filter((s) => !s.isQuoted)
    .map((s) => s.text)
    .join(' ');

  const warnings: FormulaSyntaxWarning[] = [];

  const structMatches = [...unquoted.matchAll(STRUCTURED_REF_RE)].map((m) => m[0]);
  if (structMatches.length > 0) {
    warnings.push({
      address,
      formula,
      reason: 'STRUCTURED_REF',
      tokens: [...new Set(structMatches)],
    });
  }

  const volMatches = [...unquoted.matchAll(VOLATILE_FN_RE)].map((m) => m[1].toUpperCase());
  if (volMatches.length > 0) {
    warnings.push({
      address,
      formula,
      reason: 'VOLATILE_FN',
      tokens: [...new Set(volMatches)],
    });
  }

  const o365Matches = [...unquoted.matchAll(UNSUPPORTED_O365_FN_RE)].map((m) =>
    m[1].toUpperCase(),
  );
  if (o365Matches.length > 0) {
    warnings.push({
      address,
      formula,
      reason: 'UNSUPPORTED_O365_FN',
      tokens: [...new Set(o365Matches)],
    });
  }

  return warnings;
}
