import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it } from 'vitest';
import { useFinPulseStore } from '@/store/useFinPulseStore';

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

describe('useFinPulseStore (Zustand + Live-Sync reload + Scenariusze)', () => {
  it('obsługuje suwaki, presety, snapshoty scenariuszy i Live-Sync reload z zachowaniem mnożników', async () => {
    const buf = await fs.readFile(TEMPLATE_PATH);
    const store = useFinPulseStore.getState();

    // 1. Wczytanie bazowego pliku
    const initRes = await store.ingestWorkbookBuffer(
      buf,
      'Budzet_BETA_v2_Standard.xlsx',
      'builtin',
    );
    expect(initRes.valid).toBe(true);

    let st = useFinPulseStore.getState();
    expect(st.isSimulationActive).toBe(false);
    expect(st.selectedPeriod).toBe(9); // defaultPeriod = 10 -> idx 9 (paź)
    expect(st.scenarios).toHaveLength(1);
    const baseRevYear = st.baseDomain!.pl.byCode.PL_REV_TOTAL.yearValue!;

    // 2. Mutacja suwaka vol = +25%
    st.setSliderValue('vol', 0.25);
    st = useFinPulseStore.getState();
    expect(st.isSimulationActive).toBe(true);
    expect(st.activeDomain!.pl.byCode.PL_REV_TOTAL.yearValue!).toBeCloseTo(
      baseRevYear * 1.25,
      2,
    );
    expect(st.activeAudit!.integrity.maxBalanceDiff).toBeLessThan(0.01);
    expect(st.activeAudit!.integrity.zeroPointLocked).toBe(true);

    // 3. Preset SAVINGS -> headcountTotal = 23, vol zresetowane do 0
    st.applyPreset('SAVINGS');
    st = useFinPulseStore.getState();
    expect(st.activePresetId).toBe('SAVINGS');
    expect(st.sliderValues.vol).toBe(0);
    expect(st.activeDomain!.config.headcountTotal).toBe(23);
    expect(st.activeAudit!.integrity.maxBalanceDiff).toBeLessThan(0.01);
    expect(st.activeAudit!.integrity.maxAllocVsPlDiff).toBeLessThan(0.01);

    const savingsNetYear = st.activeDomain!.pl.byCode.PL_NET_INCOME.yearValue!;

    // 4. Zapis scenariusza -> reset -> wczytanie zapisanego scenariusza
    const saved = st.saveCurrentAsScenario('Pakiet Zarządu');
    expect(saved).not.toBeNull();
    expect(useFinPulseStore.getState().scenarios).toHaveLength(2);

    st.resetSimulation();
    st = useFinPulseStore.getState();
    expect(st.isSimulationActive).toBe(false);
    expect(st.activeDomain!.config.headcountTotal).toBe(25);

    st.loadScenario(saved!.id);
    st = useFinPulseStore.getState();
    expect(st.isSimulationActive).toBe(true);
    expect(st.activeDomain!.config.headcountTotal).toBe(23);
    expect(st.activeDomain!.pl.byCode.PL_NET_INCOME.yearValue!).toBeCloseTo(
      savingsNetYear,
      2,
    );

    // 5. Symulacja Live-Sync reload (Ctrl+S): nowa cena X = 95, nowa obsada PROD = 16, przy aktywnym vol = +10%
    st.resetSimulation();
    useFinPulseStore.getState().setSliderValue('vol', 0.1);

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(new Uint8Array(buf).buffer);

    // Zmiana ceny Produktu X (90 -> 95) w TBL_PRODUCTS
    const wsAsm = wb.getWorksheet('01_Zalozenia_Modelu')!;
    wsAsm.eachRow((row) => {
      if (row.getCell(1).value === 'PROD_X') {
        row.getCell(5).value = 95;
      }
    });

    // Zmiana obsady Produkcji (14 -> 16) w TBL_DEPARTMENTS
    const wsAlloc = wb.getWorksheet('02_Alokacja_Dzialy')!;
    wsAlloc.eachRow((row) => {
      if (row.getCell(1).value === 'PROD') {
        row.getCell(5).value = 16;
      }
    });

    const editedBuf = await wb.xlsx.writeBuffer();
    const reloadRes = await useFinPulseStore
      .getState()
      .ingestWorkbookBuffer(new Uint8Array(editedBuf), 'Budzet_BETA_v2_Standard.xlsx', 'live');

    expect(reloadRes.valid).toBe(true);
    expect(reloadRes.changes.some((c) => c.label.includes('Produkt X (cena)'))).toBe(true);
    expect(reloadRes.changes.some((c) => c.label.includes('Obsada: Produkcja'))).toBe(true);

    const afterReload = useFinPulseStore.getState();
    // Nowa obsada z Excela przyjęta (16+4+2+3+2 = 27)
    expect(afterReload.sliderValues['hc_auto:PROD']).toBe(16);
    expect(afterReload.activeDomain!.config.headcountTotal).toBe(27);
    // Aktywny suwak vol = +10% zachowany na nowej bazie (nowa baza X = 40000*95 = 3.8M + Y 3.3M + Z 2.1M = 9.2M -> * 1.1 = 10.12M)
    expect(afterReload.sliderValues.vol).toBe(0.1);
    expect(afterReload.activeDomain!.pl.byCode.PL_REV_TOTAL.yearValue!).toBeCloseTo(
      9_200_000 * 1.1,
      2,
    );
    expect(afterReload.activeAudit!.integrity.maxBalanceDiff).toBeLessThan(0.01);
  });
});
