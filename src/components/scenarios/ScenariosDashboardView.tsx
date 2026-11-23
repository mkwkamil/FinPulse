import { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  FileSpreadsheet,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { ScenarioComparisonChart } from '@/components/charts/ScenarioComparisonChart';
import { ScenarioCardList } from '@/components/scenarios/ScenarioCardList';
import { ScenarioComparisonTable } from '@/components/scenarios/ScenarioComparisonTable';
import {
  buildExportFileName,
  downloadXlsxBuffer,
  exportScenarioToXlsxBuffer,
} from '@/engine/excelExporter';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { ScenarioSnapshot } from '@/types/scenario';

export function ScenariosDashboardView() {
  const session = useFinPulseStore((s) => s.session);
  const fileName = useFinPulseStore((s) => s.fileName);
  const baseDomain = useFinPulseStore((s) => s.baseDomain);
  const activeDomain = useFinPulseStore((s) => s.activeDomain);
  const activeAudit = useFinPulseStore((s) => s.activeAudit);
  const sliderValues = useFinPulseStore((s) => s.sliderValues);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);
  const scenarios = useFinPulseStore((s) => s.scenarios);
  const selectedScenarioIds = useFinPulseStore((s) => s.selectedScenarioIds);

  const saveCurrentAsScenario = useFinPulseStore((s) => s.saveCurrentAsScenario);
  const importPresetsAsScenarios = useFinPulseStore(
    (s) => s.importPresetsAsScenarios,
  );
  const loadScenario = useFinPulseStore((s) => s.loadScenario);
  const deleteScenario = useFinPulseStore((s) => s.deleteScenario);
  const renameScenario = useFinPulseStore((s) => s.renameScenario);
  const toggleScenarioSelection = useFinPulseStore(
    (s) => s.toggleScenarioSelection,
  );
  const setDrawerOpen = useFinPulseStore((s) => s.setDrawerOpen);
  const showToast = useFinPulseStore((s) => s.showToast);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [includeLiveSim, setIncludeLiveSim] = useState(true);
  const [includeComparisonSheet, setIncludeComparisonSheet] = useState(true);
  const [exportingId, setExportingId] = useState<string | null>(null);

  const missingPresetsCount = useMemo(() => {
    if (!baseDomain) return 0;
    const existingNames = new Set(
      scenarios.map((s) => s.name.trim().toLowerCase()),
    );
    return baseDomain.presets.filter(
      (p) =>
        p.id.toUpperCase() !== 'BASE' &&
        !existingNames.has(p.name.trim().toLowerCase()),
    ).length;
  }, [baseDomain, scenarios]);

  const comparedScenarios = useMemo<ScenarioSnapshot[]>(() => {
    const selected = scenarios.filter((s) => selectedScenarioIds.includes(s.id));
    const ordered = selected.length > 0 ? selected : scenarios.slice(0, 1);

    if (
      isSimulationActive &&
      includeLiveSim &&
      activeDomain &&
      activeAudit
    ) {
      const liveSnapshot: ScenarioSnapshot = {
        id: '__live_sim__',
        name: 'Bieżąca symulacja',
        description: 'Aktualny stan suwaków (niezapisany)',
        createdAt: new Date().toISOString(),
        sliderValues: { ...sliderValues },
        domain: activeDomain,
        audit: activeAudit,
      };
      return [...ordered, liveSnapshot];
    }
    return ordered;
  }, [
    scenarios,
    selectedScenarioIds,
    isSimulationActive,
    includeLiveSim,
    activeDomain,
    activeAudit,
    sliderValues,
  ]);

  if (!session || !baseDomain || !activeDomain) {
    return null;
  }

  const currency = baseDomain.metadata.currency || 'PLN';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) return;
    const saved = saveCurrentAsScenario(trimmed, newDesc);
    if (saved) {
      showToast({
        variant: 'success',
        title: `Zapisano scenariusz „${saved.name}”`,
        details: 'Dodany do tabeli porównawczej i zapisany lokalnie w przeglądarce.',
      });
      setNewName('');
      setNewDesc('');
    }
  };

  const handleImportPresets = () => {
    const added = importPresetsAsScenarios();
    if (added > 0) {
      showToast({
        variant: 'success',
        title: `Zaimportowano ${added} presetów z Excela`,
        details: 'Przeliczone warianty są gotowe do porównania Side-by-Side.',
      });
    } else {
      showToast({
        variant: 'info',
        title: 'Wszystkie presety z pliku są już na liście',
      });
    }
  };

  const handleExport = async (
    targetId: string,
    targetName: string,
    targetSliders: Record<string, number>,
  ) => {
    setExportingId(targetId);
    try {
      const bytes = await exportScenarioToXlsxBuffer({
        session,
        sliderValues: targetSliders,
        scenarioName: targetName,
        includeComparisonSheet,
        comparisonScenarios: comparedScenarios,
      });
      const outName = buildExportFileName(fileName, targetName);
      downloadXlsxBuffer(bytes, outName);
      showToast({
        variant: 'success',
        title: `Wyeksportowano ${outName}`,
        details: includeComparisonSheet
          ? 'Zachowano formuły, zaktualizowano cache HyperFormula i dodano zakładkę 99_Porownanie_Scenariuszy.'
          : 'Zachowano wszystkie oryginalne formuły i odświeżono cache wartości.',
      });
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Błąd eksportu do .xlsx',
        details: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setExportingId(null);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Górny panel zarządzania i eksportu */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Formularz zapisu bieżącego scenariusza */}
        <form
          onSubmit={handleSave}
          className="glass-card flex flex-col justify-between p-5 lg:col-span-7"
        >
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-semibold text-white">
                Zapisz bieżący stan suwaków jako scenariusz
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                {missingPresetsCount > 0 ? (
                  <button
                    type="button"
                    onClick={handleImportPresets}
                    className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-violet-400/50 bg-violet-500/20 px-3 py-1 text-xs font-semibold text-violet-100 transition hover:bg-violet-500/30"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Dodaj presety z Excela ({missingPresetsCount})
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setDrawerOpen(true)}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-3 py-1 text-xs font-semibold text-white transition hover:border-sky-400/60"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" />
                  Panel symulacji
                </button>
              </div>
            </div>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Snapshoty zapisują konfigurację wszystkich suwaków i odświeżają się automatycznie przy przeładowaniu pliku z dysku (Live-Sync).
            </p>
          </div>

          <div className="mt-4 flex flex-col gap-2.5 sm:flex-row">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nazwa scenariusza (np. Pakiet oszczędności Q2)"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-[var(--ink-muted)] focus:border-sky-400/60 focus:outline-none sm:text-sm"
            />
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Notatka dla zarządu (opcjonalnie)"
              className="min-w-0 flex-1 rounded-xl border border-white/15 bg-white/[0.05] px-3 py-2 text-xs text-white placeholder:text-[var(--ink-muted)] focus:border-sky-400/60 focus:outline-none sm:text-sm"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-violet-500 px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40 sm:text-sm"
            >
              <BookmarkPlus className="h-4 w-4" />
              Zapisz scenariusz
            </button>
          </div>
        </form>

        {/* Bezstratny eksport .xlsx */}
        <div className="glass-card flex flex-col justify-between p-5 lg:col-span-5">
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Eksport aktywnego modelu do .xlsx
            </h2>
            <p className="mt-1 text-xs text-[var(--ink-muted)]">
              Generuje nowy plik Excel z zachowaniem stylów, formuł, Nazwanych Zakresów oraz odświeżonym cache z HyperFormula (`fullCalcOnLoad`).
            </p>

            <div className="mt-3 space-y-2 text-xs">
              <label className="flex cursor-pointer items-center gap-2 text-[var(--ink-secondary)]">
                <input
                  type="checkbox"
                  checked={includeComparisonSheet}
                  onChange={(e) => setIncludeComparisonSheet(e.target.checked)}
                  className="h-4 w-4 rounded accent-emerald-400"
                />
                <span>
                  Dołącz arkusz zarządczy <code className="text-sky-200">99_Porownanie_Scenariuszy</code>
                </span>
              </label>

              {isSimulationActive ? (
                <label className="flex cursor-pointer items-center gap-2 text-amber-200">
                  <input
                    type="checkbox"
                    checked={includeLiveSim}
                    onChange={(e) => setIncludeLiveSim(e.target.checked)}
                    className="h-4 w-4 rounded accent-amber-400"
                  />
                  <span>Uwzględnij bieżącą niezapisaną symulację w porównaniu</span>
                </label>
              ) : null}
            </div>
          </div>

          <button
            type="button"
            disabled={exportingId !== null}
            onClick={() =>
              void handleExport(
                'active',
                isSimulationActive ? 'Symulacja_Aktywna' : 'Budzet_Bazowy',
                sliderValues,
              )
            }
            className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 py-2.5 text-xs font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:opacity-50 sm:text-sm"
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-300" />
            {exportingId === 'active'
              ? 'Generowanie pliku .xlsx w przeglądarce…'
              : 'Eksportuj bieżący model do .xlsx'}
          </button>
        </div>
      </section>

      {/* Karty scenariuszy */}
      <ScenarioCardList
        scenarios={scenarios}
        selectedScenarioIds={selectedScenarioIds}
        currency={currency}
        exportingId={exportingId}
        onToggleSelect={toggleScenarioSelection}
        onLoadScenario={loadScenario}
        onRenameScenario={renameScenario}
        onDeleteScenario={deleteScenario}
        onExportScenario={(sc) =>
          void handleExport(sc.id, sc.name, sc.sliderValues)
        }
      />

      {/* Wykres porównawczy ECharts */}
      <ScenarioComparisonChart
        scenarios={comparedScenarios}
        currency={currency}
      />

      {/* Tabela Side-by-Side TanStack Table */}
      <ScenarioComparisonTable
        scenarios={comparedScenarios}
        baseDomain={baseDomain}
      />
    </div>
  );
}
