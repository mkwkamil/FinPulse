import { useCallback, useEffect, useRef, useState } from 'react';
import { validateZipSignature } from '@/parsers/excelAdapter';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import type { FinPulseFileSystemFileHandle } from '@/types/fsa';
import {
  clearFileHandle,
  loadFileHandle,
  saveFileHandle,
} from '@/utils/idbHandleStore';

export const BUILTIN_TEMPLATE_URL = '/templates/Budzet_BETA_v2_Standard.xlsx';
export const BUILTIN_TEMPLATE_NAME = 'Budzet_BETA_v2_Standard.xlsx';

const POLL_INTERVAL_MS = 1500;
const ATOMIC_SAVE_DEBOUNCE_MS = 250;
const RETRY_DELAY_MS = 400;
const MAX_READ_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isExcelFileName(name: string): boolean {
  return /\.xls[xm]$/i.test(name.trim());
}

export interface UseExcelLiveSyncResult {
  isDragging: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  supportsFilePicker: boolean;
  pickFile: () => Promise<void>;
  resumeSync: () => Promise<void>;
  manualRefresh: () => Promise<void>;
  handleFileInputChange: (file: File | undefined) => Promise<void>;
  disconnectToBuiltin: () => Promise<void>;
  downloadTemplate: () => void;
}

export function useExcelLiveSync(): UseExcelLiveSyncResult {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const handleRef = useRef<FinPulseFileSystemFileHandle | null>(null);
  const lastMetaRef = useRef<{ lastModified: number; size: number } | null>(null);
  const pollTimerRef = useRef<number | null>(null);
  const isSyncingRef = useRef(false);
  const dragDepthRef = useRef(0);

  const supportsFilePicker =
    typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function';

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current !== null) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const loadBuiltinTemplate = useCallback(
    async (overrideMode: 'builtin' | 'resume' = 'builtin') => {
      const store = useFinPulseStore.getState();
      try {
        const res = await fetch(BUILTIN_TEMPLATE_URL);
        if (!res.ok) {
          throw new Error(`HTTP ${res.status} podczas ładowania wbudowanego szablonu.`);
        }
        const buf = await res.arrayBuffer();
        await store.ingestWorkbookBuffer(buf, BUILTIN_TEMPLATE_NAME, overrideMode);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        store.setLoadError(msg);
        store.showToast({
          variant: 'error',
          title: 'Błąd wczytywania wbudowanego modelu',
          details: msg,
        });
      }
    },
    [],
  );

  const readFromHandle = useCallback(
    async (
      handle: FinPulseFileSystemFileHandle,
      opts: { force: boolean; isInitialAttach: boolean },
    ) => {
      if (isSyncingRef.current) return;
      isSyncingRef.current = true;
      const store = useFinPulseStore.getState();

      try {
        const probeFile = await handle.getFile();
        if (
          !opts.force &&
          lastMetaRef.current &&
          probeFile.lastModified === lastMetaRef.current.lastModified &&
          probeFile.size === lastMetaRef.current.size
        ) {
          return;
        }

        if (!opts.isInitialAttach) {
          await sleep(ATOMIC_SAVE_DEBOUNCE_MS);
        }

        let buf: ArrayBuffer | null = null;
        let finalFile: File = probeFile;
        let lastErr: unknown = null;

        for (let attempt = 1; attempt <= MAX_READ_RETRIES; attempt++) {
          try {
            finalFile = await handle.getFile();
            const candidate = await finalFile.arrayBuffer();
            if (!validateZipSignature(new Uint8Array(candidate))) {
              throw new Error('Plik w trakcie zapisu (niekompletna sygnatura ZIP).');
            }
            buf = candidate;
            break;
          } catch (err) {
            lastErr = err;
            if (attempt < MAX_READ_RETRIES) {
              await sleep(RETRY_DELAY_MS);
            }
          }
        }

        if (!buf) {
          const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
          if (!opts.isInitialAttach) {
            store.showToast({
              variant: 'warning',
              title: 'Plik chwilowo zablokowany przez Excel',
              details: `Zachowano poprzedni spójny model. (${msg})`,
            });
          } else {
            throw lastErr instanceof Error ? lastErr : new Error(msg);
          }
          return;
        }

        lastMetaRef.current = {
          lastModified: finalFile.lastModified,
          size: finalFile.size,
        };

        const { valid, changes } = await store.ingestWorkbookBuffer(
          buf,
          finalFile.name,
          'live',
        );

        if (!valid) {
          store.showToast({
            variant: 'error',
            title: `Niezgodny plik: ${finalFile.name}`,
            details: 'Sprawdź szczegóły Audytora Kontraktu v1.0.',
          });
          return;
        }

        if (opts.isInitialAttach) {
          store.showToast({
            variant: 'success',
            title: `Połączono na żywo: ${finalFile.name}`,
            details: 'Każde zapisanie w Excelu (Ctrl+S) odświeży dashboard automatycznie.',
          });
        } else {
          const summary =
            changes.length > 0
              ? changes
                  .slice(0, 5)
                  .map((c) => `${c.label}: ${c.before} → ${c.after}`)
                  .join(' · ') + (changes.length > 5 ? ` · +${changes.length - 5} więcej` : '')
              : 'Brak zmian w założeniach (przeliczono model).';
          store.showToast({
            variant: 'success',
            title: `Excel zaktualizowany (${finalFile.name})`,
            details: summary,
          });
        }
      } catch (err) {
        if (opts.isInitialAttach) {
          const msg = err instanceof Error ? err.message : String(err);
          store.showToast({
            variant: 'error',
            title: 'Nie udało się podłączyć pliku Excel',
            details: msg,
          });
        }
      } finally {
        isSyncingRef.current = false;
      }
    },
    [],
  );

  const startPolling = useCallback(() => {
    stopPolling();
    pollTimerRef.current = window.setInterval(() => {
      if (document.hidden || !handleRef.current) return;
      const mode = useFinPulseStore.getState().syncMode;
      if (mode !== 'live') return;
      void readFromHandle(handleRef.current, { force: false, isInitialAttach: false });
    }, POLL_INTERVAL_MS);
  }, [readFromHandle, stopPolling]);

  const attachHandle = useCallback(
    async (handle: FinPulseFileSystemFileHandle) => {
      if (!isExcelFileName(handle.name)) {
        useFinPulseStore.getState().showToast({
          variant: 'error',
          title: 'Nieobsługiwany format pliku',
          details: 'Wybierz skoroszyt Excel (.xlsx lub .xlsm).',
        });
        return;
      }
      handleRef.current = handle;
      lastMetaRef.current = null;
      useFinPulseStore.getState().setResumeFileName(null);
      await saveFileHandle(handle).catch(() => {});
      await readFromHandle(handle, { force: true, isInitialAttach: true });
      startPolling();
    },
    [readFromHandle, startPolling],
  );

  const loadManualFile = useCallback(
    async (file: File) => {
      const store = useFinPulseStore.getState();
      if (!isExcelFileName(file.name)) {
        store.showToast({
          variant: 'error',
          title: 'Nieobsługiwany format pliku',
          details: 'Wybierz skoroszyt Excel (.xlsx lub .xlsm).',
        });
        return;
      }
      stopPolling();
      handleRef.current = null;
      lastMetaRef.current = { lastModified: file.lastModified, size: file.size };
      store.setResumeFileName(null);
      await clearFileHandle();

      try {
        const buf = await file.arrayBuffer();
        const { valid } = await store.ingestWorkbookBuffer(buf, file.name, 'manual');
        if (valid) {
          store.showToast({
            variant: 'info',
            title: `Wczytano plik: ${file.name}`,
            details:
              'Tryb ręczny (przeglądarka nie udostępnia stałego uchwytu). Po edycji upuść plik ponownie.',
          });
        }
      } catch (err) {
        store.showToast({
          variant: 'error',
          title: 'Nie udało się odczytać pliku .xlsx',
          details: err instanceof Error ? err.message : String(err),
        });
      }
    },
    [stopPolling],
  );

  const resumeSync = useCallback(async () => {
    const h = handleRef.current;
    if (!h) return;
    try {
      const perm = h.requestPermission ? await h.requestPermission({ mode: 'read' }) : 'granted';
      if (perm === 'granted') {
        await attachHandle(h);
      } else {
        useFinPulseStore.getState().showToast({
          variant: 'warning',
          title: 'Brak zgody na odczyt pliku',
          details: 'Wskaż plik ręcznie lub zezwól przeglądarce na odczyt.',
        });
      }
    } catch (err) {
      useFinPulseStore.getState().showToast({
        variant: 'error',
        title: 'Nie udało się wznowić połączenia',
        details: err instanceof Error ? err.message : String(err),
      });
    }
  }, [attachHandle]);

  const pickFile = useCallback(async () => {
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker({
          multiple: false,
          types: [
            {
              description: 'Skoroszyt Excel',
              accept: {
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': [
                  '.xlsx',
                  '.xlsm',
                ],
              },
            },
          ],
        });
        if (handle) {
          await attachHandle(handle);
        }
        return;
      } catch (err) {
        if (err && typeof err === 'object' && 'name' in err && err.name === 'AbortError') {
          return;
        }
        // Fallback na <input type="file"> (np. osadzony iframe bez uprawnień FSA)
      }
    }
    fileInputRef.current?.click();
  }, [attachHandle]);

  const manualRefresh = useCallback(async () => {
    if (!handleRef.current) return;
    await readFromHandle(handleRef.current, { force: true, isInitialAttach: false });
  }, [readFromHandle]);

  const handleFileInputChange = useCallback(
    async (file: File | undefined) => {
      if (!file) return;
      await loadManualFile(file);
    },
    [loadManualFile],
  );

  const disconnectToBuiltin = useCallback(async () => {
    stopPolling();
    handleRef.current = null;
    lastMetaRef.current = null;
    useFinPulseStore.getState().setResumeFileName(null);
    await clearFileHandle();
    await loadBuiltinTemplate('builtin');
    useFinPulseStore.getState().showToast({
      variant: 'info',
      title: 'Przywrócono wbudowany model wzorcowy',
      details: BUILTIN_TEMPLATE_NAME,
    });
  }, [loadBuiltinTemplate, stopPolling]);

  const downloadTemplate = useCallback(() => {
    const a = document.createElement('a');
    a.href = BUILTIN_TEMPLATE_URL;
    a.download = BUILTIN_TEMPLATE_NAME;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  // Inicjalizacja przy montowaniu: sprawdź IndexedDB -> albo wznowienie/live, albo wbudowany szablon
  useEffect(() => {
    let cancelled = false;

    async function init() {
      const savedHandle = await loadFileHandle();
      if (cancelled) return;

      if (savedHandle) {
        handleRef.current = savedHandle;
        try {
          const perm = savedHandle.queryPermission
            ? await savedHandle.queryPermission({ mode: 'read' })
            : 'prompt';
          if (cancelled) return;

          if (perm === 'granted') {
            await attachHandle(savedHandle);
            return;
          }

          useFinPulseStore.getState().setResumeFileName(savedHandle.name);
          await loadBuiltinTemplate('resume');
          return;
        } catch {
          handleRef.current = null;
          await clearFileHandle();
        }
      }

      if (!cancelled) {
        await loadBuiltinTemplate('builtin');
      }
    }

    void init();

    return () => {
      cancelled = true;
      stopPolling();
      useFinPulseStore.getState().session?.destroy();
    };
  }, [attachHandle, loadBuiltinTemplate, stopPolling]);

  // Natychmiastowe sprawdzenie zmian przy powrocie do karty (Alt+Tab z Excela)
  useEffect(() => {
    const checkNow = () => {
      if (document.hidden || !handleRef.current) return;
      if (useFinPulseStore.getState().syncMode !== 'live') return;
      void readFromHandle(handleRef.current, { force: false, isInitialAttach: false });
    };
    document.addEventListener('visibilitychange', checkNow);
    window.addEventListener('focus', checkNow);
    return () => {
      document.removeEventListener('visibilitychange', checkNow);
      window.removeEventListener('focus', checkNow);
    };
  }, [readFromHandle]);

  // Globalny Drag & Drop na oknie
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current++;
      setIsDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) setIsDragging(false);
    };
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepthRef.current = 0;
      setIsDragging(false);

      const item = e.dataTransfer?.items?.[0];
      if (item && typeof item.getAsFileSystemHandle === 'function') {
        try {
          const handle = await item.getAsFileSystemHandle();
          if (handle && handle.kind === 'file') {
            await attachHandle(handle as FinPulseFileSystemFileHandle);
            return;
          }
        } catch {
          // Przejdź do fallbacku File
        }
      }
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        await loadManualFile(file);
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [attachHandle, loadManualFile]);

  return {
    isDragging,
    fileInputRef,
    supportsFilePicker,
    pickFile,
    resumeSync,
    manualRefresh,
    handleFileInputChange,
    disconnectToBuiltin,
    downloadTemplate,
  };
}
