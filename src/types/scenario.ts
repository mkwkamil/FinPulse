import type { ModelAuditReport } from './audit';
import type { FinancialDomainModel } from './financial';

export type SyncMode = 'builtin' | 'live' | 'resume' | 'manual';

export type ActiveView = 'costs' | 'financials' | 'scenarios';

export type FinancialsSubTab = 'overview' | 'pl' | 'bs' | 'cf' | 'ratios';

export interface ToastMessage {
  id: string;
  variant: 'success' | 'info' | 'warning' | 'error';
  title: string;
  details?: string;
}

export interface ScenarioSnapshot {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  isBase?: boolean;
  sliderValues: Record<string, number>;
  domain: FinancialDomainModel;
  audit: ModelAuditReport;
}
