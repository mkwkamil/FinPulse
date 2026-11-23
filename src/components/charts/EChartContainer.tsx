import type { ReactNode } from 'react';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface EChartContainerProps {
  title: string;
  subtitle?: string;
  headerRight?: ReactNode;
  containerRef: React.RefObject<HTMLDivElement | null>;
  onExportPng: () => void;
  heightClass?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  className?: string;
}

export function EChartContainer({
  title,
  subtitle,
  headerRight,
  containerRef,
  onExportPng,
  heightClass = 'h-[360px]',
  isEmpty = false,
  emptyMessage = 'Brak danych do wyświetlenia wykresu.',
  className,
}: EChartContainerProps) {
  return (
    <section className={cn('glass-card p-5', className)}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold text-white">{title}</h2>
          {subtitle ? (
            <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {headerRight}
          {!isEmpty ? (
            <button
              type="button"
              onClick={onExportPng}
              title="Pobierz wykres jako PNG (2x Retina)"
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.05] px-2.5 py-1 text-xs font-medium text-[var(--ink-secondary)] transition hover:border-sky-400/60 hover:text-white"
            >
              <Download className="h-3.5 w-3.5" />
              Eksport PNG
            </button>
          ) : null}
        </div>
      </div>

      {isEmpty ? (
        <div
          className={cn(
            'flex items-center justify-center rounded-xl border border-dashed border-white/10 text-xs text-[var(--ink-muted)]',
            heightClass,
          )}
        >
          {emptyMessage}
        </div>
      ) : (
        <div
          ref={containerRef}
          className={cn('w-full select-none', heightClass)}
        />
      )}
    </section>
  );
}
