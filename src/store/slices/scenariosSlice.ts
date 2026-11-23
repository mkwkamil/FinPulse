import type { StateCreator } from 'zustand';
import { HyperFormulaEngine } from '@/engine/formulaEngine';
import { auditWorkbook } from '@/engine/modelAuditor';
import { extractDomainModel } from '@/parsers/domainExtractor';
import type { ScenarioSnapshot } from '@/types/scenario';
import {
  buildBaseSliderValues,
  buildMutationsForSliderValues,
  computeIsSimulationActive,
} from './simulationSlice';
import type { FinPulseStoreState, ScenariosSlice } from './types';

export interface PersistedScenarioDescriptor {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  sliderValues: Record<string, number>;
}

const MAX_SELECTED_SCENARIOS = 5;

export function getScenariosStorageKey(fingerprint: string): string {
  return `finpulse:scenarios:${fingerprint}`;
}

export function safeReadScenarioDescriptors(
  fingerprint: string,
): PersistedScenarioDescriptor[] {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(getScenariosStorageKey(fingerprint));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PersistedScenarioDescriptor[]) : [];
  } catch {
    return [];
  }
}

export function safePersistScenarios(
  fingerprint: string | null,
  scenarios: ScenarioSnapshot[],
): void {
  if (!fingerprint) return;
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return;
  }
  try {
    const descriptors: PersistedScenarioDescriptor[] = scenarios
      .filter((s) => !s.isBase)
      .map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        createdAt: s.createdAt,
        sliderValues: s.sliderValues,
      }));
    window.localStorage.setItem(
      getScenariosStorageKey(fingerprint),
      JSON.stringify(descriptors),
    );
  } catch {
    // Bezpieczne zignorowanie przepełnienia lub zablokowanego storage
  }
}

export const createScenariosSlice: StateCreator<
  FinPulseStoreState,
  [],
  [],
  ScenariosSlice
> = (set, get) => ({
  scenarios: [],
  selectedScenarioIds: [],

  saveCurrentAsScenario: (name, description) => {
    const trimmed = name.trim();
    const {
      activeDomain,
      activeAudit,
      sliderValues,
      scenarios,
      selectedScenarioIds,
      fileFingerprint,
    } = get();

    if (!trimmed || !activeDomain || !activeAudit) return null;

    const id = `scen-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const snapshot: ScenarioSnapshot = {
      id,
      name: trimmed,
      description: description?.trim() || undefined,
      createdAt: new Date().toISOString(),
      sliderValues: { ...sliderValues },
      domain: activeDomain,
      audit: activeAudit,
    };

    const nextScenarios = [...scenarios, snapshot];
    const nextSelected = selectedScenarioIds.includes(id)
      ? selectedScenarioIds
      : [...selectedScenarioIds, id].slice(-MAX_SELECTED_SCENARIOS);
    if (!nextSelected.includes('base') && nextScenarios.some((s) => s.id === 'base')) {
      nextSelected.unshift('base');
    }

    safePersistScenarios(fileFingerprint, nextScenarios);

    set({
      scenarios: nextScenarios,
      selectedScenarioIds: nextSelected,
    });
    return snapshot;
  },

  importPresetsAsScenarios: () => {
    const {
      session,
      baseDomain,
      scenarios,
      selectedScenarioIds,
      fileFingerprint,
    } = get();

    if (!session || !baseDomain || baseDomain.presets.length === 0) return 0;

    const existingNames = new Set(scenarios.map((s) => s.name.trim().toLowerCase()));
    const toImport = baseDomain.presets.filter(
      (p) =>
        p.id.toUpperCase() !== 'BASE' &&
        !existingNames.has(p.name.trim().toLowerCase()),
    );

    if (toImport.length === 0) return 0;

    const baseZeroVector = baseDomain.bs.rows.map((r) => ({
      lineCode: r.lineCode,
      value: r.zeroValue,
    }));

    const created: ScenarioSnapshot[] = [];
    const tempEngine = new HyperFormulaEngine(session.adapted);

    try {
      for (const preset of toImport) {
        tempEngine.resetToBaseline();
        const merged = buildBaseSliderValues(baseDomain.sliderControls);
        for (const [k, v] of Object.entries(preset.values)) {
          if (k in merged) merged[k] = v;
        }
        const muts = buildMutationsForSliderValues(baseDomain.sliderControls, merged);
        tempEngine.setInputsBatch(muts);
        const domain = extractDomainModel(tempEngine, session.adapted);
        const audit = auditWorkbook(session.adapted, tempEngine, domain, baseZeroVector);

        created.push({
          id: `preset-${preset.id.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: preset.name,
          description: preset.description || undefined,
          createdAt: new Date().toISOString(),
          sliderValues: merged,
          domain,
          audit,
        });
      }
    } finally {
      tempEngine.destroy();
    }

    const nextScenarios = [...scenarios, ...created];
    const nextSelected = [...selectedScenarioIds];
    for (const sc of created) {
      if (nextSelected.length < MAX_SELECTED_SCENARIOS && !nextSelected.includes(sc.id)) {
        nextSelected.push(sc.id);
      }
    }
    if (!nextSelected.includes('base') && nextScenarios.some((s) => s.id === 'base')) {
      nextSelected.pop();
      nextSelected.unshift('base');
    }

    safePersistScenarios(fileFingerprint, nextScenarios);

    set({
      scenarios: nextScenarios,
      selectedScenarioIds: nextSelected,
    });

    return created.length;
  },

  loadScenario: (id) => {
    const { scenarios, session, baseDomain } = get();
    if (!session || !baseDomain) return;

    if (id === 'base') {
      get().resetSimulation();
      return;
    }

    const found = scenarios.find((s) => s.id === id);
    if (!found) return;

    const merged = buildBaseSliderValues(baseDomain.sliderControls);
    for (const [k, v] of Object.entries(found.sliderValues)) {
      if (k in merged) merged[k] = v;
    }

    const active = computeIsSimulationActive(baseDomain.sliderControls, merged);
    if (!active) {
      const { domain, audit } = session.reset();
      set({
        sliderValues: merged,
        activeDomain: domain,
        activeAudit: audit,
        activePresetId: null,
        isSimulationActive: false,
      });
      return;
    }

    const muts = buildMutationsForSliderValues(baseDomain.sliderControls, merged);
    const { domain, audit } = session.applyMutations(muts);
    set({
      sliderValues: merged,
      activeDomain: domain,
      activeAudit: audit,
      activePresetId: null,
      isSimulationActive: true,
    });
  },

  deleteScenario: (id) => {
    if (id === 'base') return;
    const { scenarios, selectedScenarioIds, fileFingerprint } = get();
    const nextScenarios = scenarios.filter((s) => s.id !== id);
    const nextSelected = selectedScenarioIds.filter((sid) => sid !== id);
    safePersistScenarios(fileFingerprint, nextScenarios);
    set({
      scenarios: nextScenarios,
      selectedScenarioIds: nextSelected,
    });
  },

  renameScenario: (id, name) => {
    if (id === 'base') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const { scenarios, fileFingerprint } = get();
    const nextScenarios = scenarios.map((s) =>
      s.id === id ? { ...s, name: trimmed } : s,
    );
    safePersistScenarios(fileFingerprint, nextScenarios);
    set({ scenarios: nextScenarios });
  },

  toggleScenarioSelection: (id) => {
    const { selectedScenarioIds } = get();
    if (selectedScenarioIds.includes(id)) {
      if (selectedScenarioIds.length <= 1) return;
      set({
        selectedScenarioIds: selectedScenarioIds.filter((s) => s !== id),
      });
    } else {
      const next = [...selectedScenarioIds, id];
      set({
        selectedScenarioIds: next.slice(-MAX_SELECTED_SCENARIOS),
      });
    }
  },
});
