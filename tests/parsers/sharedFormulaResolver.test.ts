import { describe, expect, it } from 'vitest';
import {
  detectUnsupportedSyntax,
  normalizeFormulaForHF,
  stripXlfnPrefixes,
} from '@/parsers/formulaSanitizer';
import { parseA1Range, resolveSharedFormula } from '@/parsers/sharedFormulaResolver';

describe('sharedFormulaResolver', () => {
  it('przesuwa względne referencje przy zachowaniu kotwic $', () => {
    expect(resolveSharedFormula('=SUM($F33:G33)', 'G34', 'H34')).toBe('=SUM($F33:H33)');
    expect(resolveSharedFormula('=A1+$B$2+$C3+D$4', 'E1', 'F3')).toBe('=B3+$B$2+$C5+E$4');
  });

  it('przesuwa zakresy i linki międzyarkuszowe bez niszczenia cytowanych nazw arkuszy', () => {
    expect(
      resolveSharedFormula("='04_RZiS'!F5+'05_Bilans'!$F$10", 'F12', 'G12'),
    ).toBe("='04_RZiS'!G5+'05_Bilans'!$F$10");
  });

  it('chroni literały tekstowe, nazwy funkcji i Named Ranges przypominające adresy komórek', () => {
    const formula =
      '=IF(CFG_Q4_SHARE>0, BO_AR_B2B + LOG10(A1) + SIM_M1_DELTA, "A1:B2")';
    const resolved = resolveSharedFormula(formula, 'B2', 'C4');
    expect(resolved).toBe(
      '=IF(CFG_Q4_SHARE>0, BO_AR_B2B + LOG10(B3) + SIM_M1_DELTA, "A1:B2")',
    );
  });

  it('parsuje zakresy A1 z apostrofami i pojedyncze komórki', () => {
    expect(parseA1Range("'01_Zalozenia_Modelu'!$C$5:$C$8")).toEqual({
      sheet: '01_Zalozenia_Modelu',
      r1: 4,
      c1: 2,
      r2: 7,
      c2: 2,
    });
    expect(parseA1Range('04_RZiS!R20')).toEqual({
      sheet: '04_RZiS',
      r1: 19,
      c1: 17,
      r2: 19,
      c2: 17,
    });
  });
});

describe('formulaSanitizer', () => {
  it('usuwa prefiksy _xlfn. wyłącznie poza literałami tekstowymi', () => {
    expect(stripXlfnPrefixes('=_xlfn.MAXIFS(A1:A5,B1:B5,"_xlfn.X")')).toBe(
      '=MAXIFS(A1:A5,B1:B5,"_xlfn.X")',
    );
    expect(normalizeFormulaForHF(' _xlfn._xlws.IFS(A1>0,"OK") ')).toBe('=IFS(A1>0,"OK")');
  });

  it('wykrywa Structured References, funkcje ulotne i nieobsługiwane funkcje O365', () => {
    const warnings = detectUnsupportedSyntax(
      '=XLOOKUP(A1,TBL[Key],TBL[Val])+OFFSET(B1,0,1)+"OFFSET(ignore)"',
      'S1!C5',
    );
    expect(warnings.map((w) => w.reason).sort()).toEqual([
      'STRUCTURED_REF',
      'UNSUPPORTED_O365_FN',
      'VOLATILE_FN',
    ]);
    expect(warnings.find((w) => w.reason === 'VOLATILE_FN')?.tokens).toEqual(['OFFSET']);
    expect(warnings.find((w) => w.reason === 'UNSUPPORTED_O365_FN')?.tokens).toEqual([
      'XLOOKUP',
    ]);
  });
});
