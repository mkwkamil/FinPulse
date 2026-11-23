import { useEffect } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import { cn } from '@/lib/utils';

export function ToastNotification() {
  const toast = useFinPulseStore((s) => s.toast);
  const dismissToast = useFinPulseStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast) return;
    const ms = toast.variant === 'error' ? 9000 : 6500;
    const id = window.setTimeout(dismissToast, ms);
    return () => window.clearTimeout(id);
  }, [toast, dismissToast]);

  if (!toast) return null;

  const borderClass =
    toast.variant === 'error'
      ? 'border-rose-400/55 bg-[#1b1120]/95 text-rose-100'
      : toast.variant === 'warning'
        ? 'border-amber-400/55 bg-[#1d1912]/95 text-amber-100'
        : toast.variant === 'success'
          ? 'border-emerald-400/50 bg-[#0d1f26]/95 text-emerald-50'
          : 'border-sky-400/50 bg-[#101932]/95 text-sky-50';

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'fixed bottom-5 left-1/2 z-50 flex w-[min(680px,calc(100vw-2rem))] -translate-x-1/2 items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-md',
        borderClass,
      )}
    >
      {toast.variant === 'success' ? (
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
      ) : toast.variant === 'info' ? (
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
      ) : (
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
      )}
      <div className="min-w-0 flex-1 text-xs sm:text-sm">
        <div className="font-semibold">{toast.title}</div>
        {toast.details ? (
          <div className="mt-0.5 break-words text-xs opacity-85">{toast.details}</div>
        ) : null}
      </div>
      <button
        type="button"
        onClick={dismissToast}
        aria-label="Zamknij powiadomienie"
        className="cursor-pointer rounded-md p-1 opacity-75 transition hover:bg-white/10 hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
