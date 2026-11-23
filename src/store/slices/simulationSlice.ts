import type { StateCreator } from 'zustand';
import type { EngineCellMutation } from '@/engine/formulaEngine';
import type { ResolvedSliderControl } from '@/types/contract';
import type { FinPulseStoreState, SimulationSlice } from './types';

export function buildBaseSliderValues(
  controls: ResolvedSliderControl[],
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const c of controls) {
    map[c.controlKey] = c.baseValue;
  }
  return map;
}

export function computeIsSimulationActive(
  controls: ResolvedSliderControl[],
  sliderValues: Record<string, number>,
): boolean {
  return controls.some((ctrl) => {
    const val = sliderValues[ctrl.controlKey] ?? ctrl.baseValue;
    return Math.abs(val - ctrl.baseValue) > 1e-9;
  });
}

export function mutationsForControl(
  ctrl: ResolvedSliderControl,
  value: number,
): EngineCellMutation[] {
  const muts: EngineCellMutation[] = [{ coord: ctrl.cell, value }];
  if (ctrl.extraCells) {
    for (const extra of ctrl.extraCells) {
      muts.push({ coord: extra, value });
    }
  }
  return muts;
}

export function buildMutationsForSliderValues(
  controls: ResolvedSliderControl[],
  sliderValues: Record<string, number>,
): EngineCellMutation[] {
  const muts: EngineCellMutation[] = [];
  for (const ctrl of controls) {
    const value = sliderValues[ctrl.controlKey] ?? ctrl.baseValue;
    muts.push(...mutationsForControl(ctrl, value));
  }
  return muts;
}

export const createSimulationSlice: StateCreator<
  FinPulseStoreState,
  [],
  [],
  SimulationSlice
> = (set, get) => ({
  sliderValues: {},
  activePresetId: null,
  isSimulationActive: false,
  drawerOpen: false,

  setSliderValue: (controlKey, value) => {
    const { session, baseDomain, sliderValues } = get();
    if (!session || !baseDomain) return;
    const ctrl = baseDomain.sliderControls.find((c) => c.controlKey === controlKey);
    if (!ctrl) return;

    const nextValues = { ...sliderValues, [controlKey]: value };
    const { domain, audit } = session.applyMutations(mutationsForControl(ctrl, value));
    const isSimulationActive = computeIsSimulationActive(
      baseDomain.sliderControls,
      nextValues,
    );

    set({
      sliderValues: nextValues,
      activeDomain: domain,
      activeAudit: audit,
      activePresetId: null,
      isSimulationActive,
    });
  },

  resetSlider: (controlKey) => {
    const { baseDomain } = get();
    if (!baseDomain) return;
    const ctrl = baseDomain.sliderControls.find((c) => c.controlKey === controlKey);
    if (!ctrl) return;
    get().setSliderValue(controlKey, ctrl.baseValue);
  },

  applyPreset: (presetId) => {
    const { session, baseDomain } = get();
    if (!session || !baseDomain) return;
    const preset = baseDomain.presets.find((p) => p.id === presetId);
    if (!preset) return;

    const nextValues = buildBaseSliderValues(baseDomain.sliderControls);
    for (const [key, val] of Object.entries(preset.values)) {
      if (key in nextValues) {
        nextValues[key] = val;
      }
    }

    const active = computeIsSimulationActive(baseDomain.sliderControls, nextValues);
    if (!active) {
      const { domain, audit } = session.reset();
      set({
        sliderValues: nextValues,
        activeDomain: domain,
        activeAudit: audit,
        activePresetId: presetId,
        isSimulationActive: false,
      });
      return;
    }

    const muts = buildMutationsForSliderValues(baseDomain.sliderControls, nextValues);
    const { domain, audit } = session.applyMutations(muts);
    set({
      sliderValues: nextValues,
      activeDomain: domain,
      activeAudit: audit,
      activePresetId: presetId,
      isSimulationActive: true,
    });
  },

  resetSimulation: () => {
    const { session, baseDomain } = get();
    if (!session || !baseDomain) return;
    const { domain, audit } = session.reset();
    set({
      sliderValues: buildBaseSliderValues(baseDomain.sliderControls),
      activeDomain: domain,
      activeAudit: audit,
      activePresetId: null,
      isSimulationActive: false,
    });
  },

  setDrawerOpen: (drawerOpen) => set({ drawerOpen }),
});
