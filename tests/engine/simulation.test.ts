import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFinancialEngineSession } from '@/engine/formulaEngine';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

describe('Symulacje What-If i niezmienność Momentu Zero', () => {
  it('przelicza scenariusze optymistyczny (CIT > 0), stresowy (pożyczka wspólników), zmiany obsady i reset', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const base = session.baseDomain!;
      const byKey = new Map(base.sliderControls.map((c) => [c.controlKey, c]));
      const baseNet = base.pl.byCode.PL_NET_INCOME.yearValue!;
      const baseZeroAssets = base.bs.byCode.BS_ASSETS_TOTAL.zeroValue!;

      // 1. Scenariusz z dodatnim EBT i CIT > 0
      const resOpt = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: 0.25 },
        { coord: byKey.get('price')!.cell, value: 0.15 },
        { coord: byKey.get('raw')!.cell, value: -0.1 },
      ]);

      const ebtOpt = resOpt.domain.pl.byCode.PL_EBT.yearValue!;
      const citOpt = resOpt.domain.pl.byCode.PL_CIT.yearValue!;
      expect(ebtOpt).toBeGreaterThan(0);
      expect(citOpt).toBeCloseTo(0.19 * ebtOpt, 2);
      expect(resOpt.audit.integrity.maxBalanceDiff).toBeLessThan(0.01);
      expect(resOpt.audit.integrity.maxCfVsBsDiff).toBeLessThan(0.01);
      expect(resOpt.audit.integrity.maxAllocVsPlDiff).toBeLessThan(0.01);
      expect(resOpt.audit.integrity.zeroPointLocked).toBe(true);
      expect(resOpt.domain.bs.byCode.BS_ASSETS_TOTAL.zeroValue).toBe(baseZeroAssets);

      // 2. Scenariusz kryzysowy -> pożyczka wspólników i ostrzeżenie Bramki 5
      const resStress = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: -0.3 },
        { coord: byKey.get('price')!.cell, value: -0.2 },
        { coord: byKey.get('raw')!.cell, value: 0.3 },
      ]);

      expect(resStress.audit.covenants.maxOverdraft).toBeLessThanOrEqual(3_000_000.01);
      expect(resStress.audit.covenants.maxShareholderLoan).toBeGreaterThan(0);
      expect(resStress.audit.covenants.minCash).toBeGreaterThanOrEqual(199_999.99);
      expect(resStress.audit.integrity.maxBalanceDiff).toBeLessThan(0.01);
      expect(resStress.audit.integrity.zeroPointLocked).toBe(true);
      expect(resStress.audit.gates.find((g) => g.gateId === 'GATE_5_COVENANTS')?.status).not.toBe(
        'OK',
      );

      // 3. Reset wraca do bazy, a zmiana obsady/najmu aktualizuje płace i zachowuje spójność
      const resReset = session.reset();
      expect(resReset.domain.pl.byCode.PL_NET_INCOME.yearValue).toBeCloseTo(baseNet, 2);
      expect(resReset.audit.overallStatus).toBe('OK');

      const resHc = session.applyMutations([
        { coord: byKey.get('hc_auto:PROD')!.cell, value: 18 },
        { coord: byKey.get('rn_auto:PROD')!.cell, value: 70 },
      ]);
      expect(resHc.domain.config.headcountTotal).toBe(29);
      expect(resHc.domain.pl.byCode.PL_FIX_WAGES.months[0]).toBeCloseTo(203_000, 2);
      expect(resHc.audit.integrity.maxAllocVsPlDiff).toBeLessThan(0.01);
      expect(resHc.audit.integrity.maxBalanceDiff).toBeLessThan(0.01);
      expect(resHc.audit.integrity.zeroPointLocked).toBe(true);
    } finally {
      session.destroy();
    }
  });

  it('chroni komórki formułowe przed przypadkowym nadpisaniem przez mutacje What-If', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const hcRange = session.engine.getNamedRange('CFG_HEADCOUNT_TOTAL')!;
      expect(() =>
        session.applyMutations([
          { coord: { sheet: hcRange.sheet, row: hcRange.r1, col: hcRange.c1 }, value: 999 },
        ]),
      ).toThrow(/Zabroniona mutacja komórki z formułą/);
    } finally {
      session.destroy();
    }
  });
});
