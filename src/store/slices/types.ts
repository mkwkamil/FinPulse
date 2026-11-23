import type { FinancialEngineSession } from '@/engine/formulaEngine';
import type { ResolvedSliderControl } from '@/types/contract';
import type { ModelAuditReport } from '@/types/audit';
import type { FinancialDomainModel } from '@/types/financial';
import type {
  ActiveView,
  FinancialsSubTab,
  ScenarioSnapshot,
  SyncMode,
  ToastMessage,
} from '@/types/scenario';
import type { WorkbookChangeItem } from '@/utils/workbookDiff';

export interface WorkbookSlice {
  session: FinancialEngineSession | null;
  fileName: string;
  fileFingerprint: string | null;
  syncMode: SyncMode;
  resumeFileName: string | null;
  lastLoadedAt: number | null;
  isLoading: boolean;
  loadError: string | null;
  baseDomain: FinancialDomainModel | null;
  activeDomain: FinancialDomainModel | null;
  baseAudit: ModelAuditReport | null;
  activeAudit: ModelAuditReport | null;

  ingestWorkbookBuffer: (
    buffer: ArrayBuffer | Uint8Array,
    fileName: string,
    mode: SyncMode,
  ) => Promise<{ valid: boolean; changes: WorkbookChangeItem[] }>;
  setSyncMode: (mode: SyncMode) => void;
  setResumeFileName: (name: string | null) => void;
  setLoadError: (err: string | null) => void;
  setLoading: (loading: boolean) => void;
}

export interface SimulationSlice {
  sliderValues: Record<string, number>;
  activePresetId: string | null;
  isSimulationActive: boolean;
  drawerOpen: boolean;

  setSliderValue: (controlKey: string, value: number) => void;
  resetSlider: (controlKey: string) => void;
  applyPreset: (presetId: string) => void;
  resetSimulation: () => void;
  setDrawerOpen: (open: boolean) => void;
}

export interface ScenariosSlice {
  scenarios: ScenarioSnapshot[];
  selectedScenarioIds: string[];

  saveCurrentAsScenario: (name: string, description?: string) => ScenarioSnapshot | null;
  importPresetsAsScenarios: () => number;
  loadScenario: (id: string) => void;
  deleteScenario: (id: string) => void;
  renameScenario: (id: string, name: string) => void;
  toggleScenarioSelection: (id: string) => void;
}

export interface UiSlice {
  activeView: ActiveView;
  financialsTab: FinancialsSubTab;
  selectedPeriod: number; // 0..N-1 for months, -1 for full year
  selectedDeptCode: string | null;
  presentationMode: boolean;
  auditModalOpen: boolean;
  toast: ToastMessage | null;

  setActiveView: (view: ActiveView) => void;
  setFinancialsTab: (tab: FinancialsSubTab) => void;
  setSelectedPeriod: (periodIdx: number) => void;
  setSelectedDeptCode: (deptCode: string | null) => void;
  togglePresentationMode: () => void;
  setAuditModalOpen: (open: boolean) => void;
  showToast: (toast: Omit<ToastMessage, 'id'>) => void;
  dismissToast: () => void;
}

export type FinPulseStoreState = WorkbookSlice &
  SimulationSlice &
  ScenariosSlice &
  UiSlice;

export type SliderControlsLookup = Map<string, ResolvedSliderControl>;
