import { lazy, Suspense } from 'react';
import { MonitorPlay, ShieldCheck } from 'lucide-react';
import { AuditBanner } from '@/components/layout/AuditBanner';
import { DropzoneOverlay } from '@/components/layout/DropzoneOverlay';
import { LiveSyncBar } from '@/components/layout/LiveSyncBar';
import { ToastNotification } from '@/components/layout/ToastNotification';
import { SimulationDrawer } from '@/components/simulation/SimulationDrawer';
import { useExcelLiveSync } from '@/hooks/useExcelLiveSync';
import { cn } from '@/lib/utils';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { ActiveView } from '@/types/scenario';
import { formatPeriodLong, formatPeriodShort } from '@/utils/formatters';

const CostsDashboardView = lazy(() =>
  import('@/components/costs/CostsDashboardView').then((m) => ({
    default: m.CostsDashboardView,
  })),
);

const FinancialsDashboardView = lazy(() =>
  import('@/components/financials/FinancialsDashboardView').then((m) => ({
    default: m.FinancialsDashboardView,
  })),
);

const ScenariosDashboardView = lazy(() =>
  import('@/components/scenarios/ScenariosDashboardView').then((m) => ({
    default: m.ScenariosDashboardView,
  })),
);

function ViewChunkFallback() {
  return (
    <div className="glass-card p-10 text-center text-sm text-[var(--ink-secondary)]">
      Przygotowanie widoku analitycznego…
    </div>
  );
}

const VIEW_TABS: Array<{ id: ActiveView; label: string }> = [
  { id: 'costs', label: 'Analiza kosztów' },
  { id: 'financials', label: 'Przegląd finansowy' },
  { id: 'scenarios', label: 'Porównywarka scenariuszy' },
];

export function App() {
  const sync = useExcelLiveSync();

  const activeDomain = useFinPulseStore((s) => s.activeDomain);
  const activeAudit = useFinPulseStore((s) => s.activeAudit);
  const isLoading = useFinPulseStore((s) => s.isLoading);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);
  const activeView = useFinPulseStore((s) => s.activeView);
  const selectedPeriod = useFinPulseStore((s) => s.selectedPeriod);
  const presentationMode = useFinPulseStore((s) => s.presentationMode);

  const setActiveView = useFinPulseStore((s) => s.setActiveView);
  const setSelectedPeriod = useFinPulseStore((s) => s.setSelectedPeriod);
  const togglePresentationMode = useFinPulseStore((s) => s.togglePresentationMode);
  const setAuditModalOpen = useFinPulseStore((s) => s.setAuditModalOpen);

  const periodHeaders = activeDomain?.metadata.periodHeaders ?? [];
  const multiYear = periodHeaders.length > 12;
  const periodTitle =
    selectedPeriod < 0
      ? `Cały okres (${periodHeaders.length}M)`
      : formatPeriodLong(periodHeaders[selectedPeriod] ?? '');

  const currency = activeDomain?.metadata.currency ?? 'PLN';

  return (
    <div
      className={cn(
        'mx-auto flex max-w-7xl flex-col gap-4 px-4 py-6 sm:px-6',
        presentationMode && 'text-[108%]',
      )}
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--accent-glow)]">
            FP&amp;A · {activeDomain?.metadata.companyName ?? 'FinPulse'} · Kontrakt v
            {activeDomain?.metadata.schemaVersion ?? '1.0'}
          </p>
          <h1 className="font-display mt-1 bg-gradient-to-r from-white via-[#9cc6ff] to-[#b7aefc] bg-clip-text text-2xl font-bold tracking-tight text-transparent sm:text-3xl">
            {activeDomain?.metadata.budgetTitle ?? 'FinPulse — Analiza i Symulacje'}
          </h1>
          {activeDomain ? (
            <p className="mt-0.5 text-xs text-[var(--ink-secondary)] sm:text-sm">
              {periodTitle} · Moment zero: {activeDomain.metadata.zeroDate} · {currency} netto
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSimulationActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/60 bg-amber-400/12 px-3 py-1 text-xs font-semibold text-amber-200 shadow-[0_0_16px_rgba(255,211,107,0.25)]">
              <span className="h-2 w-2 rounded-full bg-[#ffd36b]" />
              Symulacja aktywna
            </span>
          ) : null}

          {activeAudit ? (
            <button
              type="button"
              onClick={() => setAuditModalOpen(true)}
              className={cn(
                'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition hover:brightness-115',
                activeAudit.overallStatus === 'OK'
                  ? 'border-emerald-400/45 bg-emerald-400/10 text-emerald-300'
                  : activeAudit.overallStatus === 'WARNING'
                    ? 'border-amber-400/50 bg-amber-400/12 text-amber-200'
                    : 'border-rose-400/55 bg-rose-400/15 text-rose-200',
              )}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Audytor: {activeAudit.overallStatus} (
              {activeAudit.parity.checkedCachedCount}/{activeAudit.parity.totalFormulaCells})
            </button>
          ) : null}

          <button
            type="button"
            onClick={togglePresentationMode}
            title="Przełącz tryb prezentacji dla zarządu"
            className={cn(
              'inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition',
              presentationMode
                ? 'border-sky-400/70 bg-sky-500/25 text-white'
                : 'border-white/15 bg-white/5 text-[var(--ink-secondary)] hover:text-white',
            )}
          >
            <MonitorPlay className="h-3.5 w-3.5" />
            Tryb Zarządu
          </button>
        </div>
      </header>

      {!presentationMode ? <LiveSyncBar sync={sync} /> : null}

      <AuditBanner onDownloadTemplate={sync.downloadTemplate} />

      {activeDomain ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <nav
              aria-label="Główne widoki"
              className="glass-card inline-flex gap-1 rounded-full p-1"
            >
              {VIEW_TABS.map((tab) => {
                const selected = activeView === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveView(tab.id)}
                    className={cn(
                      'cursor-pointer rounded-full px-4 py-1.5 text-xs font-semibold transition sm:text-sm',
                      selected
                        ? 'bg-gradient-to-br from-sky-500/70 to-violet-500/60 text-white shadow-[0_0_16px_rgba(74,163,255,0.4)]'
                        : 'text-[var(--ink-secondary)] hover:text-white',
                    )}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </nav>

            {activeView !== 'scenarios' ? (
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label="Wybór okresu"
              >
                {periodHeaders.map((hdr, idx) => (
                  <button
                    key={hdr}
                    type="button"
                    onClick={() => setSelectedPeriod(idx)}
                    aria-pressed={selectedPeriod === idx}
                    className={cn(
                      'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition',
                      selectedPeriod === idx
                        ? 'border-sky-400/90 bg-gradient-to-br from-sky-500/55 to-violet-500/45 text-white shadow-[0_0_14px_rgba(74,163,255,0.45)]'
                        : 'border-white/10 bg-white/[0.04] text-[var(--ink-secondary)] hover:border-white/25 hover:text-white',
                    )}
                  >
                    {formatPeriodShort(hdr, multiYear)}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedPeriod(-1)}
                  aria-pressed={selectedPeriod === -1}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition',
                    selectedPeriod === -1
                      ? 'border-sky-400/90 bg-gradient-to-br from-sky-500/55 to-violet-500/45 text-white shadow-[0_0_14px_rgba(74,163,255,0.45)]'
                      : 'border-white/10 bg-white/[0.04] text-[var(--ink-secondary)] hover:border-white/25 hover:text-white',
                  )}
                >
                  Cały okres
                </button>
              </div>
            ) : null}
          </div>

          <Suspense fallback={<ViewChunkFallback />}>
            {activeView === 'costs' ? (
              <CostsDashboardView />
            ) : activeView === 'financials' ? (
              <FinancialsDashboardView />
            ) : (
              <ScenariosDashboardView />
            )}
          </Suspense>
        </>
      ) : isLoading ? (
        <div className="glass-card p-12 text-center text-sm text-[var(--ink-secondary)]">
          Ładowanie i audyt skoroszytu w pamięci przeglądarki…
        </div>
      ) : null}

      <SimulationDrawer />
      <DropzoneOverlay visible={sync.isDragging} />
      <ToastNotification />
    </div>
  );
}
