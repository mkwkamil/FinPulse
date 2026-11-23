import { useEffect } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileWarning,
  Info,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { AuditSeverity } from '@/types/audit';
import { cn } from '@/lib/utils';

interface AuditBannerProps {
  onDownloadTemplate: () => void;
}

function badgeClasses(status: AuditSeverity): string {
  switch (status) {
    case 'OK':
      return 'border-emerald-400/40 bg-emerald-400/10 text-emerald-300';
    case 'WARNING':
      return 'border-amber-400/50 bg-amber-400/12 text-amber-200';
    case 'CRITICAL':
      return 'border-rose-400/55 bg-rose-400/15 text-rose-200';
    default:
      return 'border-sky-400/40 bg-sky-400/10 text-sky-200';
  }
}

export function AuditBanner({ onDownloadTemplate }: AuditBannerProps) {
  const activeAudit = useFinPulseStore((s) => s.activeAudit);
  const modalOpen = useFinPulseStore((s) => s.auditModalOpen);
  const setModalOpen = useFinPulseStore((s) => s.setAuditModalOpen);

  useEffect(() => {
    if (!modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalOpen, setModalOpen]);

  if (!activeAudit) return null;

  const { contract, parity, integrity, gates, overallStatus } = activeAudit;

  return (
    <>
      {/* Ostrzeżenie inline jeśli status != OK */}
      {overallStatus !== 'OK' ? (
        <div
          className={cn(
            'glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm',
            overallStatus === 'CRITICAL'
              ? 'border-rose-400/50 bg-rose-500/10 text-rose-100'
              : 'border-amber-400/45 bg-amber-500/10 text-amber-100',
          )}
        >
          <div className="flex items-start gap-3">
            {contract.isLegacyBetaCandidate ? (
              <FileWarning className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            ) : (
              <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-rose-300" />
            )}
            <div>
              <p className="font-semibold">
                {contract.isLegacyBetaCandidate
                  ? 'Wykryto starszy plik BETA (sprzed standaryzacji Kontraktu v1.0)'
                  : overallStatus === 'CRITICAL'
                    ? 'Audytor Modelu wykrył problem krytyczny'
                    : 'Audytor Modelu zgłosił ostrzeżenie'}
              </p>
              <p className="text-xs opacity-90">
                {contract.diagnosticMessage ??
                  gates.find((g) => g.status === overallStatus)?.summary}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!contract.valid ? (
              <button
                type="button"
                onClick={onDownloadTemplate}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/25 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500/35"
              >
                <Download className="h-3.5 w-3.5" />
                Pobierz szablon v1.0
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              className="cursor-pointer rounded-lg border border-white/20 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/20"
            >
              Raport 5 bramek
            </button>
          </div>
        </div>
      ) : null}

      {/* Modal 5 bramek Audytora */}
      {modalOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Raport Audytora Modelu"
        >
          <div className="glass-card flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden border-white/20 bg-[#0b1226]/95">
            <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="h-5 w-5 text-[var(--accent-glow)]" />
                <div>
                  <h2 className="font-display text-lg font-bold text-white">
                    Audytor Spójności Modelu (5 bramek)
                  </h2>
                  <p className="text-xs text-[var(--ink-muted)]">
                    Parzystość cache: {parity.checkedCachedCount} / {parity.totalFormulaCells} formuł ·
                    Δ bilansu: {integrity.maxBalanceDiff.toFixed(4)} PLN
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Zamknij raport audytora"
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/5 text-white transition hover:bg-white/15"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto p-6">
              {!contract.valid ? (
                <div className="rounded-xl border border-amber-400/40 bg-amber-500/10 p-4 text-xs leading-relaxed text-amber-100">
                  <p className="font-semibold text-amber-200">
                    {contract.isLegacyBetaCandidate
                      ? 'Jak przejść ze starego modelu BETA na Kontrakt v1.0?'
                      : 'Niezgodność ze standardem Kontraktu Danych v1.0'}
                  </p>
                  <p className="mt-1">{contract.diagnosticMessage}</p>
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={onDownloadTemplate}
                      className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/25 px-3 py-1.5 font-semibold text-white hover:bg-sky-500/35"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Pobierz wzorzec Budzet_BETA_v2_Standard.xlsx
                    </button>
                  </div>
                </div>
              ) : null}

              {gates.map((gate) => (
                <div
                  key={gate.gateId}
                  className="rounded-xl border border-white/10 bg-white/[0.03] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      {gate.status === 'OK' ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      ) : gate.status === 'INFO' ? (
                        <Info className="h-4 w-4 shrink-0 text-sky-400" />
                      ) : (
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                      )}
                      <span className="text-sm font-semibold text-white">{gate.title}</span>
                    </div>
                    <span
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] font-semibold',
                        badgeClasses(gate.status),
                      )}
                    >
                      {gate.status}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[var(--ink-secondary)]">{gate.summary}</p>
                  {gate.details.length > 0 ? (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-200/90">
                      {gate.details.map((d, i) => (
                        <li key={i} className="font-mono-num">
                          {d}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
