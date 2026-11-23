import type { StateCreator } from 'zustand';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import type { FinancialDomainModel } from '@/types/financial';
import type { ScenarioSnapshot } from '@/types/scenario';
import { diffDomainModels } from '@/utils/workbookDiff';
import { safeReadScenarioDescriptors } from './scenariosSlice';
import {
  buildBaseSliderValues,
  buildMutationsForSliderValues,
  computeIsSimulationActive,
} from './simulationSlice';
import type { FinPulseStoreState, WorkbookSlice } from './types';

function computeFingerprint(domain: FinancialDomainModel): string {
  const m = domain.metadata;
  return `${m.companyName}::${m.budgetTitle}::${m.zeroDate}::${m.periodHeaders.length}`;
}

export const createWorkbookSlice: StateCreator<
  FinPulseStoreState,
  [],
  [],
  WorkbookSlice
> = (set, get) => ({
  session: null,
  fileName: '',
  fileFingerprint: null,
  syncMode: 'builtin',
  resumeFileName: null,
  lastLoadedAt: null,
  isLoading: false,
  loadError: null,
  baseDomain: null,
  activeDomain: null,
  baseAudit: null,
  activeAudit: null,

  setSyncMode: (syncMode) => set({ syncMode }),
  setResumeFileName: (resumeFileName) => set({ resumeFileName }),
  setLoadError: (loadError) => set({ loadError }),
  setLoading: (isLoading) => set({ isLoading }),

  ingestWorkbookBuffer: async (buffer, fileName, mode) => {
    const prevState = get();
    set({ isLoading: true, loadError: null });

    try {
      const newSession = await createFinancialEngineSession(buffer, fileName);

      // Jeśli plik nie spełnia Kontraktu v1.0, nie niszczymy sesji błędnie przed pobraniem audytu
      if (!newSession.baseAudit.contract.valid || !newSession.baseDomain) {
        prevState.session?.destroy();
        set({
          session: newSession,
          fileName,
          fileFingerprint: null,
          syncMode: mode,
          lastLoadedAt: Date.now(),
          isLoading: false,
          loadError: newSession.baseAudit.contract.diagnosticMessage,
          baseDomain: null,
          activeDomain: null,
          baseAudit: newSession.baseAudit,
          activeAudit: newSession.activeAudit,
          sliderValues: {},
          activePresetId: null,
          isSimulationActive: false,
          scenarios: [],
          selectedScenarioIds: [],
          auditModalOpen: true,
        });
        return { valid: false, changes: [] };
      }

      const nextBaseDomain = newSession.baseDomain;
      const nextBaseAudit = newSession.baseAudit;
      const nextFingerprint = computeFingerprint(nextBaseDomain);
      const isSameModelReload =
        prevState.fileFingerprint !== null &&
        prevState.fileFingerprint === nextFingerprint;

      const changes = isSameModelReload
        ? diffDomainModels(prevState.baseDomain, nextBaseDomain)
        : [];

      // Uzgodnij okres wybrany w UI
      const periodCount = nextBaseDomain.metadata.periodHeaders.length;
      let nextSelectedPeriod = prevState.selectedPeriod;
      if (!isSameModelReload || nextSelectedPeriod >= periodCount) {
        const defP = nextBaseDomain.metadata.defaultPeriod;
        nextSelectedPeriod =
          defP >= 1 && defP <= periodCount ? defP - 1 : -1;
      }

      // Uzgodnij filtr działu
      const validDept =
        prevState.selectedDeptCode &&
        nextBaseDomain.allocation.departments.some(
          (d) => d.code === prevState.selectedDeptCode,
        )
          ? prevState.selectedDeptCode
          : null;

      // Uzgodnij suwaki: przy reloadzie tego samego modelu zachowaj aktywne mnożniki,
      // ale przyjmij zmienione w Excelu wartości kolumn tabelarycznych (obsada / najem)
      const nextSliderValues = buildBaseSliderValues(nextBaseDomain.sliderControls);
      if (isSameModelReload && prevState.baseDomain) {
        const prevBaseControls = new Map(
          prevState.baseDomain.sliderControls.map((c) => [c.controlKey, c]),
        );
        for (const ctrl of nextBaseDomain.sliderControls) {
          const prevVal = prevState.sliderValues[ctrl.controlKey];
          const prevCtrl = prevBaseControls.get(ctrl.controlKey);
          if (prevVal === undefined || !prevCtrl) continue;

          const excelChanged = Math.abs(ctrl.baseValue - prevCtrl.baseValue) > 1e-9;
          const userHadOverride = Math.abs(prevVal - prevCtrl.baseValue) > 1e-9;

          if (ctrl.mode === 'TABLE_COLUMN_ABS') {
            if (!excelChanged && userHadOverride) {
              nextSliderValues[ctrl.controlKey] = prevVal;
            }
          } else if (userHadOverride) {
            nextSliderValues[ctrl.controlKey] = prevVal;
          }
        }
      }

      // Odtwórz zapisane scenariusze z localStorage (przeliczone na nowej sesji)
      const baseScenario: ScenarioSnapshot = {
        id: 'base',
        name: 'Budżet bazowy',
        description: 'Stan bezpośrednio z pliku Excel',
        createdAt: new Date().toISOString(),
        isBase: true,
        sliderValues: buildBaseSliderValues(nextBaseDomain.sliderControls),
        domain: nextBaseDomain,
        audit: nextBaseAudit,
      };

      const persisted = safeReadScenarioDescriptors(nextFingerprint);
      const restoredScenarios: ScenarioSnapshot[] = [baseScenario];

      for (const desc of persisted) {
        const merged = buildBaseSliderValues(nextBaseDomain.sliderControls);
        for (const [k, v] of Object.entries(desc.sliderValues)) {
          if (k in merged) merged[k] = v;
        }
        const muts = buildMutationsForSliderValues(
          nextBaseDomain.sliderControls,
          merged,
        );
        const res = newSession.applyMutations(muts);
        restoredScenarios.push({
          id: desc.id,
          name: desc.name,
          description: desc.description,
          createdAt: desc.createdAt,
          sliderValues: merged,
          domain: res.domain,
          audit: res.audit,
        });
      }

      // Zastosuj finalny stan suwaków w nowej sesji
      const activeSim = computeIsSimulationActive(
        nextBaseDomain.sliderControls,
        nextSliderValues,
      );
      let finalActiveDomain = nextBaseDomain;
      let finalActiveAudit = nextBaseAudit;

      if (activeSim) {
        const muts = buildMutationsForSliderValues(
          nextBaseDomain.sliderControls,
          nextSliderValues,
        );
        const applied = newSession.applyMutations(muts);
        finalActiveDomain = applied.domain;
        finalActiveAudit = applied.audit;
      } else if (persisted.length > 0) {
        const resetRes = newSession.reset();
        finalActiveDomain = resetRes.domain;
        finalActiveAudit = resetRes.audit;
      }

      const prevSelectedIds = isSameModelReload
        ? prevState.selectedScenarioIds.filter((id) =>
            restoredScenarios.some((s) => s.id === id),
          )
        : [];
      const nextSelectedIds =
        prevSelectedIds.length > 0
          ? prevSelectedIds
          : restoredScenarios.slice(0, 5).map((s) => s.id);

      // Zniszcz starą sesję dopiero po pełnym sukcesie nowej
      prevState.session?.destroy();

      set({
        session: newSession,
        fileName,
        fileFingerprint: nextFingerprint,
        syncMode: mode,
        lastLoadedAt: Date.now(),
        isLoading: false,
        loadError: null,
        baseDomain: nextBaseDomain,
        activeDomain: finalActiveDomain,
        baseAudit: nextBaseAudit,
        activeAudit: finalActiveAudit,
        sliderValues: nextSliderValues,
        activePresetId: isSameModelReload ? prevState.activePresetId : null,
        isSimulationActive: activeSim,
        scenarios: restoredScenarios,
        selectedScenarioIds: nextSelectedIds,
        selectedPeriod: nextSelectedPeriod,
        selectedDeptCode: validDept,
      });

      return { valid: true, changes };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      set({ isLoading: false, loadError: msg });
      throw err;
    }
  },
});
