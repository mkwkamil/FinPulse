import { useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  Pencil,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { SCENARIO_PALETTE } from '@/engine/scenarioComparison';
import { cn } from '@/lib/utils';
import type { ScenarioSnapshot } from '@/types/scenario';
import { formatMoneyCompact } from '@/utils/formatters';

interface ScenarioCardListProps {
  scenarios: ScenarioSnapshot[];
  selectedScenarioIds: string[];
  currency: string;
  exportingId: string | null;
  onToggleSelect: (id: string) => void;
  onLoadScenario: (id: string) => void;
  onRenameScenario: (id: string, name: string) => void;
  onDeleteScenario: (id: string) => void;
  onExportScenario: (sc: ScenarioSnapshot) => void;
}

export function ScenarioCardList({
  scenarios,
  selectedScenarioIds,
  currency,
  exportingId,
  onToggleSelect,
  onLoadScenario,
  onRenameScenario,
  onDeleteScenario,
  onExportScenario,
}: ScenarioCardListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const startEdit = (sc: ScenarioSnapshot) => {
    setEditingId(sc.id);
    setDraftName(sc.name);
  };

  const commitEdit = (id: string) => {
    const trimmed = draftName.trim();
    if (trimmed) {
      onRenameScenario(id, trimmed);
    }
    setEditingId(null);
  };

  return (
    <section aria-label="Zapisane scenariusze" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold text-white">
            Zapisane warianty budżetu ({scenarios.length})
          </h2>
          <p className="text-xs text-[var(--ink-muted)]">
            Zaznacz do 5 scenariuszy do porównania Side-by-Side. Kliknij „Wczytaj”, aby aktywować wariant na suwakach i wykresach.
          </p>
        </div>
        <span className="text-xs text-[var(--ink-secondary)]">
          Wybrane do porównania: <strong className="text-white">{selectedScenarioIds.length}/5</strong>
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {scenarios.map((sc) => {
          const selectedIdx = selectedScenarioIds.indexOf(sc.id);
          const isSelected = selectedIdx >= 0;
          const color = isSelected
            ? SCENARIO_PALETTE[selectedIdx % SCENARIO_PALETTE.length]
            : '#64748b';
          const isEditing = editingId === sc.id;
          const isExporting = exportingId === sc.id;

          const ebitda = sc.domain.pl.byCode.PL_EBITDA?.yearValue ?? 0;
          const net = sc.domain.pl.byCode.PL_NET_INCOME?.yearValue ?? 0;
          const peakOv = sc.audit.covenants.maxOverdraft;
          const auditOk = sc.audit.overallStatus === 'OK';

          return (
            <div
              key={sc.id}
              className={cn(
                'glass-card flex flex-col justify-between p-4 transition',
                isSelected
                  ? 'border-sky-400/55 bg-sky-500/[0.06]'
                  : 'border-white/10 opacity-85 hover:opacity-100',
              )}
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => onToggleSelect(sc.id)}
                      aria-label={`Porównaj scenariusz ${sc.name}`}
                      className="h-4 w-4 cursor-pointer rounded accent-sky-400"
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    {isEditing ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1">
                        <input
                          type="text"
                          value={draftName}
                          onChange={(e) => setDraftName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitEdit(sc.id);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          autoFocus
                          className="min-w-0 flex-1 rounded border border-sky-400/50 bg-white/10 px-2 py-0.5 text-xs font-semibold text-white focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => commitEdit(sc.id)}
                          aria-label="Zatwierdź nazwę"
                          className="cursor-pointer rounded p-1 text-emerald-300 hover:bg-white/10"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          aria-label="Anuluj edycję"
                          className="cursor-pointer rounded p-1 text-[var(--ink-muted)] hover:bg-white/10"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="truncate text-sm font-semibold text-white" title={sc.name}>
                          {sc.name}
                        </h3>
                        {sc.isBase ? (
                          <span className="shrink-0 rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-sky-200">
                            Baza
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEdit(sc)}
                            aria-label={`Zmień nazwę scenariusza ${sc.name}`}
                            className="cursor-pointer rounded p-0.5 text-[var(--ink-muted)] hover:bg-white/10 hover:text-white"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <span
                    className={cn(
                      'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                      auditOk
                        ? 'bg-emerald-500/15 text-emerald-300'
                        : 'bg-amber-500/20 text-amber-200',
                    )}
                  >
                    {auditOk ? (
                      <ShieldCheck className="h-3 w-3" />
                    ) : (
                      <ShieldAlert className="h-3 w-3" />
                    )}
                    {sc.audit.overallStatus}
                  </span>
                </div>

                {sc.description ? (
                  <p className="mt-1 line-clamp-2 text-[11px] text-[var(--ink-muted)]">
                    {sc.description}
                  </p>
                ) : null}

                <dl className="mt-3 grid grid-cols-3 gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] p-2.5 text-[11px]">
                  <div>
                    <dt className="text-[var(--ink-muted)]">EBITDA</dt>
                    <dd
                      className={cn(
                        'tabular-nums mt-0.5 font-semibold',
                        ebitda >= 0 ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {formatMoneyCompact(ebitda, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-muted)]">Wynik netto</dt>
                    <dd
                      className={cn(
                        'tabular-nums mt-0.5 font-semibold',
                        net >= 0 ? 'text-emerald-300' : 'text-rose-300',
                      )}
                    >
                      {formatMoneyCompact(net, currency)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--ink-muted)]">Szczyt OD</dt>
                    <dd className="tabular-nums mt-0.5 font-semibold text-white">
                      {formatMoneyCompact(peakOv, currency)}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-2.5">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onLoadScenario(sc.id)}
                    className="cursor-pointer rounded-lg border border-sky-400/50 bg-sky-500/20 px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-sky-500/30"
                  >
                    Wczytaj
                  </button>
                  <button
                    type="button"
                    disabled={isExporting}
                    onClick={() => onExportScenario(sc)}
                    className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2.5 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/25 disabled:opacity-50"
                  >
                    <FileSpreadsheet className="h-3.5 w-3.5" />
                    {isExporting ? 'Eksport…' : 'Eksport .xlsx'}
                  </button>
                </div>

                {!sc.isBase ? (
                  <button
                    type="button"
                    onClick={() => onDeleteScenario(sc.id)}
                    aria-label={`Usuń scenariusz ${sc.name}`}
                    className="cursor-pointer rounded-lg border border-white/10 p-1.5 text-[var(--ink-muted)] transition hover:border-rose-400/50 hover:text-rose-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
