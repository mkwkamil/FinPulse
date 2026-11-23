import { FileSpreadsheet } from 'lucide-react';

interface DropzoneOverlayProps {
  visible: boolean;
}

export function DropzoneOverlay({ visible }: DropzoneOverlayProps) {
  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center border-4 border-dashed border-sky-400 bg-[#060913]/85 backdrop-blur-md">
      <div className="glass-card flex max-w-md flex-col items-center gap-3 p-8 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-sky-400/40 bg-sky-500/20 text-sky-300">
          <FileSpreadsheet className="h-7 w-7" />
        </div>
        <h2 className="font-display text-xl font-bold text-white">
          Upuść skoroszyt Excel (.xlsx)
        </h2>
        <p className="text-sm text-[var(--ink-secondary)]">
          Plik zostanie przeliczony lokalnie w przeglądarce bez wysyłania danych na serwer.
        </p>
      </div>
    </div>
  );
}
