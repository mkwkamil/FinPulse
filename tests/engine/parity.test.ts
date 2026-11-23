import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { createFinancialEngineSession } from '@/engine/formulaEngine';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

describe('Parzystość i audyt modelu BETA v2', () => {
  it('ładuje Budzet_BETA_v2_Standard.xlsx z 100% parzystością 2421 formuł i zgodnością liczb BETA', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const { baseAudit, baseDomain } = session;
      expect(baseAudit.contract.valid).toBe(true);
      expect(baseAudit.overallStatus).toBe('OK');
      expect(baseAudit.parity.totalFormulaCells).toBe(2421);
      expect(baseAudit.parity.checkedCachedCount).toBe(2421);
      expect(baseAudit.parity.mismatchCount).toBe(0);
      expect(baseAudit.parity.formulaErrors).toHaveLength(0);
      expect(baseAudit.integrity.maxBalanceDiff).toBeLessThan(0.01);
      expect(baseAudit.integrity.maxCfVsBsDiff).toBeLessThan(0.01);
      expect(baseAudit.integrity.maxAllocVsPlDiff).toBeLessThan(0.01);
      expect(baseAudit.integrity.zeroPointLocked).toBe(true);

      expect(baseDomain).not.toBeNull();
      const d = baseDomain!;

      // Metadane i rozmiary dynamiczne
      expect(d.metadata.schemaVersion).toBe('1.0');
      expect(d.metadata.periodHeaders).toHaveLength(12);
      expect(d.products).toHaveLength(3);
      expect(d.allocation.departments).toHaveLength(6);
      expect(d.allocation.categories).toHaveLength(8);
      // 9 mnożników + 5 działów z obsadą + 5 działów w najmie = 19 suwaków
      expect(d.sliderControls).toHaveLength(19);
      expect(d.presets).toHaveLength(4);

      // Dokładne wartości RZiS
      expect(d.pl.byCode.PL_REV_TOTAL.yearValue).toBeCloseTo(9_000_000, 2);
      expect(d.pl.byCode.PL_VAR_TOTAL.yearValue).toBeCloseTo(6_117_200, 2);
      expect(d.pl.byCode.PL_CONTRIB_MARGIN.yearValue).toBeCloseTo(2_882_800, 2);
      expect(d.pl.byCode.PL_EBITDA.yearValue).toBeCloseTo(-618_200, 2);
      expect(d.pl.byCode.PL_EBIT.yearValue).toBeCloseTo(-1_218_200, 2);
      expect(d.pl.byCode.PL_FIN_TOTAL.yearValue).toBeCloseTo(119_492.34, 2);
      expect(d.pl.byCode.PL_NET_INCOME.yearValue).toBeCloseTo(-1_337_692.34, 2);
      expect(d.pl.byCode.PL_NET_INCOME.months[9]).toBeCloseTo(1_904.88, 2); // Październik

      // Bilans
      expect(d.bs.byCode.BS_ASSETS_TOTAL.zeroValue).toBeCloseTo(7_500_000, 2);
      expect(d.bs.byCode.BS_ASSETS_TOTAL.months[11]).toBeCloseTo(8_544_800, 2);
      expect(d.bs.byCode.BS_OVERDRAFT.months[11]).toBeCloseTo(1_640_092.34, 2);

      // Cash Flow
      expect(d.cf.byCode.CF_CFO.yearValue).toBeCloseTo(-740_092.34, 2);
      expect(d.cf.byCode.CF_CFI.yearValue).toBeCloseTo(-2_000_000, 2);
      expect(d.cf.byCode.CF_CFF.yearValue).toBeCloseTo(2_440_092.34, 2);

      // Alokacja
      const prodDept = d.allocation.deptCosts.find((x) => x.deptCode === 'PROD')!;
      expect(prodDept.yearTotal).toBeCloseTo(6_786_160, 2);
      expect(d.allocation.deptByCategoryYear.PROD.MAT).toBeCloseTo(3_515_200, 2);
      expect(d.allocation.deptByCategoryYear.PROD.PER).toBeCloseTo(1_422_960, 2);
      expect(d.allocation.deptByCategoryYear.LOG.LOG).toBeCloseTo(832_000, 2);
    } finally {
      session.destroy();
    }
  });

  it('wykrywa stary układ pliku BETA i zwraca przyjazny komunikat diagnostyczny bez wyjątku', async () => {
    const wb = new ExcelJS.Workbook();
    for (const name of ['Założenia', 'Model', 'RZiS', 'Bilans', 'CF', 'Alok_Klucze', 'Alok_Macierz']) {
      wb.addWorksheet(name).getCell('A1').value = name;
    }
    const buf = await wb.xlsx.writeBuffer();
    const session = await createFinancialEngineSession(new Uint8Array(buf), 'Budzet_BETA_legacy.xlsx');

    try {
      expect(session.baseDomain).toBeNull();
      expect(session.baseAudit.contract.valid).toBe(false);
      expect(session.baseAudit.contract.isLegacyBetaCandidate).toBe(true);
      expect(session.baseAudit.contract.diagnosticMessage).toContain('Kontraktu Danych v1.0');
      expect(session.baseAudit.overallStatus).toBe('CRITICAL');
    } finally {
      session.destroy();
    }
  });
});
