import { Sparkles } from 'lucide-react';
import type { CostInsight } from '@/engine/insightsEngine';
import { cn } from '@/lib/utils';

interface InsightsPanelProps {
  insights: CostInsight[];
  periodLabel: string;
}

export function InsightsPanel({ insights, periodLabel }: InsightsPanelProps) {
  return (
    <section className="glass-card p-5" aria-label="Kluczowe wnioski zarządcze">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-sky-400/35 bg-sky-500/15 text-sky-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-base font-semibold text-white">
              Kluczowe wnioski · {periodLabel}
            </h2>
            <p className="text-xs text-[var(--ink-muted)]">
              Automatyczna synteza z przeliczonego modelu HyperFormula (100% deterministyczna).
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {insights.map((ins) => (
          <div
            key={ins.id}
            className={cn(
              'rounded-xl border px-3.5 py-2.5 text-xs leading-relaxed text-[var(--ink-secondary)] sm:text-[13px]',
              ins.tone === 'simulation'
                ? 'border-amber-400/45 bg-amber-400/[0.07] md:col-span-2'
                : ins.tone === 'positive'
                  ? 'border-emerald-400/30 bg-emerald-400/[0.04]'
                  : ins.tone === 'warning'
                    ? 'border-rose-400/30 bg-rose-400/[0.04]'
                    : 'border-white/10 bg-white/[0.025]',
            )}
          >
            <div className="flex items-start gap-2.5">
              <span
                className={cn(
                  'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                  ins.tone === 'simulation'
                    ? 'bg-amber-300'
                    : ins.tone === 'positive'
                      ? 'bg-emerald-400'
                      : ins.tone === 'warning'
                        ? 'bg-rose-400'
                        : 'bg-sky-400',
                )}
              />
              <p className="tabular-nums m-0">
                {ins.segments.map((seg, idx) => (
                  <span
                    key={`${ins.id}-${idx}`}
                    className={cn(
                      seg.bold && 'font-semibold',
                      seg.highlight === 'pos'
                        ? 'text-emerald-300'
                        : seg.highlight === 'neg'
                          ? 'text-rose-300'
                          : seg.highlight === 'sim'
                            ? 'text-amber-200'
                            : seg.bold
                              ? 'text-white'
                              : undefined,
                    )}
                  >
                    {seg.text}
                  </span>
                ))}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
