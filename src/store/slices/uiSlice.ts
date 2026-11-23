import type { StateCreator } from 'zustand';
import type { FinPulseStoreState, UiSlice } from './types';

let toastCounter = 0;

export const createUiSlice: StateCreator<FinPulseStoreState, [], [], UiSlice> = (
  set,
) => ({
  activeView: 'costs',
  financialsTab: 'overview',
  selectedPeriod: -1,
  selectedDeptCode: null,
  presentationMode: false,
  auditModalOpen: false,
  toast: null,

  setActiveView: (activeView) => set({ activeView }),
  setFinancialsTab: (financialsTab) => set({ financialsTab }),
  setSelectedPeriod: (selectedPeriod) => set({ selectedPeriod }),
  setSelectedDeptCode: (selectedDeptCode) => set({ selectedDeptCode }),
  togglePresentationMode: () =>
    set((s) => ({ presentationMode: !s.presentationMode })),
  setAuditModalOpen: (auditModalOpen) => set({ auditModalOpen }),
  showToast: (msg) =>
    set({
      toast: {
        ...msg,
        id: `toast-${++toastCounter}`,
      },
    }),
  dismissToast: () => set({ toast: null }),
});
