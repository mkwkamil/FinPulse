import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildExportFileName,
  exportScenarioToXlsxBuffer,
} from '@/engine/excelExporter';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import {
  buildScenarioChartData,
  buildScenarioComparisonRows,
} from '@/engine/scenarioComparison';
import { validateZipSignature } from '@/parsers/excelAdapter';
import { buildBaseSliderValues } from '@/store/slices/simulationSlice';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { ScenarioSnapshot } from '@/types/scenario';

const TEMPLATE_PATH = path.resolve(
  process.cwd(),
  'public/templates/Budzet_BETA_v2_Standard.xlsx',
);

afterEach(() => {
  const st = useFinPulseStore.getState();
  st.session?.destroy();
  useFinPulseStore.setState({
    session: null,
    fileName: '',
    fileFingerprint: null,
    baseDomain: null,
    activeDomain: null,
    baseAudit: null,
    activeAudit: null,
    sliderValues: {},
    activePresetId: null,
    isSimulationActive: false,
    scenarios: [],
    selectedScenarioIds: [],
    selectedPeriod: -1,
    selectedDeptCode: null,
  });
});

describe('Faza 5 — Porównywarka Scenariuszy Side-by-Side i Round-Trip Eksport .xlsx', () => {
  it('buduje tabelę i wykresy Side-by-Side oraz bezstratnie eksportuje i przeładowuje plik .xlsx (100% cache parity)', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const session = await createFinancialEngineSession(buf, 'Budzet_BETA_v2_Standard.xlsx');

    try {
      const baseDomain = session.baseDomain!;
      const byKey = new Map(baseDomain.sliderControls.map((c) => [c.controlKey, c]));
      const baseSliders = buildBaseSliderValues(baseDomain.sliderControls);

      const baseSnap: ScenarioSnapshot = {
        id: 'base',
        name: 'Budżet bazowy',
        createdAt: '2027-01-01T00:00:00Z',
        isBase: true,
        sliderValues: baseSliders,
        domain: baseDomain,
        audit: session.baseAudit,
      };

      const optSliders = {
        ...baseSliders,
        vol: 0.25,
        price: 0.15,
        'hc_auto:PROD': 18,
      };
      const optRes = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: 0.25 },
        { coord: byKey.get('price')!.cell, value: 0.15 },
        { coord: byKey.get('hc_auto:PROD')!.cell, value: 18 },
      ]);
      const optSnap: ScenarioSnapshot = {
        id: 'opt',
        name: 'Wzrost + Obsada PROD 18',
        createdAt: '2027-01-01T00:00:00Z',
        sliderValues: optSliders,
        domain: optRes.domain,
        audit: optRes.audit,
      };

      const stressSliders = { ...baseSliders, vol: -0.25, raw: 0.2 };
      const stressRes = session.applyMutations([
        { coord: byKey.get('vol')!.cell, value: -0.25 },
        { coord: byKey.get('price')!.cell, value: 0 },
        { coord: byKey.get('hc_auto:PROD')!.cell, value: 14 },
        { coord: byKey.get('raw')!.cell, value: 0.2 },
      ]);
      const stressSnap: ScenarioSnapshot = {
        id: 'stress',
        name: 'Stres surowcowy',
        createdAt: '2027-01-01T00:00:00Z',
        sliderValues: stressSliders,
        domain: stressRes.domain,
        audit: stressRes.audit,
      };

      // 1. Porównanie Side-by-Side
      const comparisonRows = buildScenarioComparisonRows(
        [baseSnap, optSnap, stressSnap],
        baseDomain,
      );
      expect(comparisonRows.some((r) => r.id === 'slider_vol')).toBe(true);
      expect(comparisonRows.some((r) => r.id === 'slider_price')).toBe(true);
      expect(comparisonRows.some((r) => r.id === 'slider_raw')).toBe(true);
      expect(comparisonRows.some((r) => r.id === 'slider_hc_auto:PROD')).toBe(true);
      expect(comparisonRows.some((r) => r.id === 'slider_rent')).toBe(false);

      const deptRows = comparisonRows.filter((r) => r.id.startsWith('dept_'));
      expect(deptRows).toHaveLength(baseDomain.allocation.departments.length + 1);

      const netRow = comparisonRows.find((r) => r.id === 'pl_PL_NET_INCOME')!;
      expect(netRow.deltasVsBaseByScenarioId.opt).toBeCloseTo(
        optSnap.domain.pl.byCode.PL_NET_INCOME.yearValue! -
          baseSnap.domain.pl.byCode.PL_NET_INCOME.yearValue!,
        2,
      );

      // 2. Dane wykresów Side-by-Side
      const chartData = buildScenarioChartData([baseSnap, optSnap, stressSnap]);
      expect(chartData.kpiCategories).toHaveLength(5);
      expect(chartData.kpiSeries).toHaveLength(3);
      expect(chartData.overdraftLines[0].values).toHaveLength(12);
      expect(chartData.netIncomeLines[1].values).toHaveLength(12);

      // 3. Bezstratny eksport .xlsx i Round-Trip weryfikacja przez HyperFormula + Audytora
      const exportName = buildExportFileName(
        'Budzet_BETA_v2_Standard.xlsx',
        'Wzrost + Obsada',
      );
      expect(exportName).toBe('Budzet_BETA_v2_Standard_Wzrost_Obsada.xlsx');

      const exportedBytes = await exportScenarioToXlsxBuffer({
        session,
        sliderValues: optSliders,
        scenarioName: optSnap.name,
        includeComparisonSheet: true,
        comparisonScenarios: [baseSnap, optSnap, stressSnap],
      });
      expect(validateZipSignature(exportedBytes)).toBe(true);

      const reloaded = await createFinancialEngineSession(exportedBytes, exportName);
      try {
        expect(reloaded.baseAudit.contract.valid).toBe(true);
        expect(reloaded.baseAudit.overallStatus).toBe('OK');
        expect(reloaded.baseAudit.parity.mismatchCount).toBe(0);
        expect(reloaded.baseAudit.parity.checkedCachedCount).toBe(
          reloaded.baseAudit.parity.totalFormulaCells,
        );
        expect(reloaded.baseAudit.integrity.maxBalanceDiff).toBeLessThan(0.01);
        expect(reloaded.baseAudit.integrity.maxCfVsBsDiff).toBeLessThan(0.01);
        expect(reloaded.baseAudit.integrity.maxAllocVsPlDiff).toBeLessThan(0.01);

        expect(reloaded.baseDomain!.config.headcountTotal).toBe(29);
        expect(reloaded.baseDomain!.pl.byCode.PL_NET_INCOME.yearValue).toBeCloseTo(
          optSnap.domain.pl.byCode.PL_NET_INCOME.yearValue!,
          2,
        );
        expect(reloaded.baseDomain!.bs.byCode.BS_ASSETS_TOTAL.zeroValue).toBe(7_500_000);
        expect(reloaded.adapted.sheetNames).toContain('99_Porownanie_Scenariuszy');
      } finally {
        reloaded.destroy();
      }
    } finally {
      session.destroy();
    }
  });

  it('importuje presety z Excela jako scenariusze porównawcze (idempotentnie, bez zmiany bieżącej symulacji)', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    await useFinPulseStore
      .getState()
      .ingestWorkbookBuffer(buf, 'Budzet_BETA_v2_Standard.xlsx', 'builtin');

    const beforeSliders = { ...useFinPulseStore.getState().sliderValues };
    const addedFirst = useFinPulseStore.getState().importPresetsAsScenarios();
    expect(addedFirst).toBe(3);

    const stAfter = useFinPulseStore.getState();
    expect(stAfter.scenarios).toHaveLength(4); // Baza + 3 presety
    expect(stAfter.scenarios.map((s) => s.name)).toEqual([
      'Budżet bazowy',
      'Pesymistyczny',
      'Optymistyczny',
      'Oszczędności',
    ]);
    expect(stAfter.isSimulationActive).toBe(false);
    expect(stAfter.sliderValues).toEqual(beforeSliders);

    // Ponowne wywołanie nie duplikuje scenariuszy
    const addedSecond = useFinPulseStore.getState().importPresetsAsScenarios();
    expect(addedSecond).toBe(0);
    expect(useFinPulseStore.getState().scenarios).toHaveLength(4);
  });
});
