import { Download, FolderOpen, RefreshCw, RotateCcw, Unplug } from 'lucide-react';
import type { UseExcelLiveSyncResult } from '@/hooks/useExcelLiveSync';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import { cn } from '@/lib/utils';

interface LiveSyncBarProps {
  sync: UseExcelLiveSyncResult;
}

export function LiveSyncBar({ sync }: LiveSyncBarProps) {
  const syncMode = useFinPulseStore((s) => s.syncMode);
  const fileName = useFinPulseStore((s) => s.fileName);
  const resumeFileName = useFinPulseStore((s) => s.resumeFileName);
  const lastLoadedAt = useFinPulseStore((s) => s.lastLoadedAt);
  const isLoading = useFinPulseStore((s) => s.isLoading);

  const timeLabel = lastLoadedAt
    ? new Date(lastLoadedAt).toLocaleTimeString('pl-PL')
    : '';

  const dotClass =
    syncMode === 'live'
      ? 'bg-emerald-400 shadow-[0_0_10px_#2fd1a0] animate-pulse'
      : syncMode === 'resume' || syncMode === 'manual'
        ? 'bg-amber-400 shadow-[0_0_8px_#ffd36b]'
        : 'bg-slate-400';

  return (
    <div
      className={cn(
        'glass-card flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs sm:text-sm',
        syncMode === 'live' &&
          'border-emerald-400/40 shadow-[0_0_24px_-10px_rgba(47,209,160,0.45)]',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5 text-[var(--ink-secondary)]">
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
        {syncMode === 'live' ? (
          <p className="truncate">
            <b className="text-white">Połączono na żywo:</b> {fileName}{' '}
            <span className="text-[var(--ink-muted)]">
              · odczyt {timeLabel} · zapis w Excelu (Ctrl+S) odświeży model automatycznie
            </span>
          </p>
        ) : syncMode === 'resume' && resumeFileName ? (
          <p className="truncate">
            <b className="text-white">Poprzednie połączenie:</b> {resumeFileName}{' '}
            <span className="text-[var(--ink-muted)]">
              · jedno kliknięcie wznawia Live-Sync (tymczasowo aktywny wzorzec)
            </span>
          </p>
        ) : syncMode === 'manual' ? (
          <p className="truncate">
            <b className="text-white">Wczytano z pliku:</b> {fileName}{' '}
            <span className="text-[var(--ink-muted)]">
              · {timeLabel} · po zmianach upuść plik ponownie
            </span>
          </p>
        ) : (
          <p className="truncate">
            <b className="text-white">Model wbudowany:</b> {fileName}{' '}
            <span className="text-[var(--ink-muted)]">
              · podepnij lokalny plik .xlsx, aby edycja w Excelu odświeżała dashboard na żywo
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {syncMode === 'resume' && resumeFileName ? (
          <button
            type="button"
            onClick={() => void sync.resumeSync()}
            disabled={isLoading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-amber-400/60 bg-amber-400/15 px-3 py-1.5 text-xs font-semibold text-amber-200 transition hover:bg-amber-400/25 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Wznów Live-Sync
          </button>
        ) : null}

        {syncMode === 'live' ? (
          <button
            type="button"
            onClick={() => void sync.manualRefresh()}
            disabled={isLoading}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white transition hover:border-sky-400/60 disabled:opacity-50"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Odśwież
          </button>
        ) : null}

        <button
          type="button"
          onClick={() => void sync.pickFile()}
          disabled={isLoading}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/20 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500/30 disabled:opacity-50"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {syncMode === 'live' ? 'Zmień plik' : 'Połącz z plikiem Excel'}
        </button>

        {syncMode !== 'builtin' ? (
          <button
            type="button"
            onClick={() => void sync.disconnectToBuiltin()}
            title="Rozłącz plik i wróć do wbudowanego wzorca BETA"
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:border-white/25 hover:text-white"
          >
            <Unplug className="h-3.5 w-3.5" />
            Wzorzec
          </button>
        ) : null}

        <button
          type="button"
          onClick={sync.downloadTemplate}
          title="Pobierz wzorcowy plik szablonu Kontraktu Danych v1.0"
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-medium text-[var(--ink-secondary)] transition hover:border-white/25 hover:text-white"
        >
          <Download className="h-3.5 w-3.5" />
          Szablon v1.0
        </button>
      </div>

      <input
        ref={sync.fileInputRef}
        type="file"
        accept=".xlsx,.xlsm"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          void sync.handleFileInputChange(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
