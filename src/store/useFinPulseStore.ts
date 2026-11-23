import { create } from 'zustand';
import { createScenariosSlice } from './slices/scenariosSlice';
import { createSimulationSlice } from './slices/simulationSlice';
import type { FinPulseStoreState } from './slices/types';
import { createUiSlice } from './slices/uiSlice';
import { createWorkbookSlice } from './slices/workbookSlice';

export const useFinPulseStore = create<FinPulseStoreState>()((...a) => ({
  ...createWorkbookSlice(...a),
  ...createSimulationSlice(...a),
  ...createScenariosSlice(...a),
  ...createUiSlice(...a),
}));
