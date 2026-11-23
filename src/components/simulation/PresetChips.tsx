import { useState } from 'react';
import { BookmarkPlus, RotateCcw } from 'lucide-react';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import { cn } from '@/lib/utils';

export function PresetChips() {
  const presets = useFinPulseStore((s) => s.activeDomain?.presets ?? []);
  const activePresetId = useFinPulseStore((s) => s.activePresetId);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);
  const applyPreset = useFinPulseStore((s) => s.applyPreset);
  const resetSimulation = useFinPulseStore((s) => s.resetSimulation);
  const saveCurrentAsScenario = useFinPulseStore((s) => s.saveCurrentAsScenario);
  const showToast = useFinPulseStore((s) => s.showToast);

  const [savingOpen, setSavingOpen] = useState(false);
  const [scenarioName, setScenarioName] = useState('');

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = scenarioName.trim();
    if (!trimmed) return;
    const saved = saveCurrentAsScenario(trimmed);
    if (saved) {
      showToast({
        variant: 'success',
        title: `Zapisano scenariusz „${saved.name}”`,
        details: 'Dostępny w porównywarce Side-by-Side.',
      });
      setScenarioName('');
      setSavingOpen(false);
    }
  };

  return (
    <div className="space-y-3">
      {presets.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {presets.map((p) => {
            const isActive =
              activePresetId === p.id || (p.id === 'BASE' && !isSimulationActive && !activePresetId);
            return (
              <button
                key={p.id}
                type="button"
                title={p.description}
                onClick={() => applyPreset(p.id)}
                className={cn(
                  'cursor-pointer rounded-full border px-3 py-1 text-xs font-medium transition',
                  isActive
                    ? 'border-sky-400/90 bg-gradient-to-br from-sky-500/45 to-violet-500/40 text-white shadow-[0_0_16px_rgba(74,163,255,0.45)]'
                    : 'border-white/15 bg-white/5 text-[var(--ink-secondary)] hover:border-white/30 hover:text-white',
                )}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setSavingOpen((v) => !v)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/45 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 transition hover:bg-sky-500/25"
        >
          <BookmarkPlus className="h-3.5 w-3.5" />
          Zapisz jako scenariusz
        </button>

        {isSimulationActive ? (
          <button
            type="button"
            onClick={resetSimulation}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-400/45 bg-amber-400/10 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/20"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Wróć do budżetu
          </button>
        ) : null}
      </div>

      {savingOpen ? (
        <form
          onSubmit={handleSave}
          className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 p-2"
        >
          <input
            type="text"
            value={scenarioName}
            onChange={(e) => setScenarioName(e.target.value)}
            placeholder="Nazwa scenariusza (np. Presja surowcowa)"
            className="min-w-0 flex-1 bg-transparent px-2 py-1 text-xs text-white placeholder:text-[var(--ink-muted)] focus:outline-none"
            autoFocus
          />
          <button
            type="submit"
            disabled={!scenarioName.trim()}
            className="cursor-pointer rounded-lg bg-sky-500 px-3 py-1 text-xs font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40"
          >
            Zapisz
          </button>
        </form>
      ) : null}
    </div>
  );
}
