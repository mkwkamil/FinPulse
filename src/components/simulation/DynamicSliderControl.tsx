import { RotateCcw } from 'lucide-react';
import type { ResolvedSliderControl } from '@/types/contract';
import { formatSliderValue } from '@/utils/formatters';
import { cn } from '@/lib/utils';

interface DynamicSliderControlProps {
  control: ResolvedSliderControl;
  value: number;
  normalizedShare?: number;
  onChange: (controlKey: string, value: number) => void;
  onReset: (controlKey: string) => void;
}

export function DynamicSliderControl({
  control,
  value,
  normalizedShare,
  onChange,
  onReset,
}: DynamicSliderControlProps) {
  const isChanged = Math.abs(value - control.baseValue) > 1e-9;

  return (
    <div className="py-1.5" title={control.tooltip || undefined}>
      <div className="flex items-center justify-between gap-2 text-xs sm:text-[13px]">
        <label
          htmlFor={`slider-${control.controlKey}`}
          className="cursor-pointer truncate text-[var(--ink-secondary)]"
        >
          {control.label}
        </label>
        <div className="flex shrink-0 items-center gap-1.5">
          <output
            htmlFor={`slider-${control.controlKey}`}
            className={cn(
              'tabular-nums font-semibold',
              isChanged
                ? 'text-[var(--accent-sim)] drop-shadow-[0_0_8px_rgba(255,211,107,0.45)]'
                : 'text-[var(--ink-muted)]',
            )}
          >
            {formatSliderValue(control, value, normalizedShare)}
          </output>
          {isChanged ? (
            <button
              type="button"
              onClick={() => onReset(control.controlKey)}
              title="Przywróć wartość bazową"
              aria-label={`Przywróć wartość bazową: ${control.label}`}
              className="cursor-pointer rounded p-0.5 text-[var(--ink-muted)] transition hover:bg-white/10 hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          ) : null}
        </div>
      </div>

      <input
        id={`slider-${control.controlKey}`}
        type="range"
        min={control.min}
        max={control.max}
        step={control.step}
        value={value}
        onChange={(e) => onChange(control.controlKey, Number(e.target.value))}
        className={cn(
          'mt-1.5 h-1.5 w-full cursor-pointer rounded-lg',
          isChanged ? 'accent-[#ffd36b]' : 'accent-[#4aa3ff]',
        )}
      />
    </div>
  );
}
