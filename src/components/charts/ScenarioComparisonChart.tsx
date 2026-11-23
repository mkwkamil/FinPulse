import { useMemo, useState } from 'react';
import { EChartContainer } from '@/components/charts/EChartContainer';
import { buildScenarioChartData } from '@/engine/scenarioComparison';
import { useEChart } from '@/hooks/useEChart';
import { escapeHtml, type FinPulseEChartOption } from '@/lib/echarts';
import { cn } from '@/lib/utils';
import type { ScenarioSnapshot } from '@/types/scenario';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPeriodLong,
  formatPeriodShort,
} from '@/utils/formatters';

type ComparisonChartMode = 'kpi' | 'overdraft' | 'net';

interface ScenarioComparisonChartProps {
  scenarios: ScenarioSnapshot[];
  currency: string;
}

const CHART_MODES: Array<{ id: ComparisonChartMode; label: string }> = [
  { id: 'kpi', label: 'Wyniki (Rok)' },
  { id: 'overdraft', label: 'Ścieżka Overdraftu' },
  { id: 'net', label: 'Ścieżka Wyniku netto' },
];

export function ScenarioComparisonChart({
  scenarios,
  currency,
}: ScenarioComparisonChartProps) {
  const [mode, setMode] = useState<ComparisonChartMode>('kpi');

  const chartData = useMemo(
    () => buildScenarioChartData(scenarios),
    [scenarios],
  );

  const option = useMemo<FinPulseEChartOption | null>(() => {
    if (scenarios.length === 0) return null;

    if (mode === 'kpi') {
      return {
        animationDuration: 320,
        grid: { left: 72, right: 20, top: 46, bottom: 38 },
        legend: {
          top: 0,
          textStyle: {
            color: '#b4bbd8',
            fontSize: 11,
            fontFamily: 'DM Sans, system-ui, sans-serif',
          },
          itemWidth: 12,
          itemHeight: 10,
          itemGap: 14,
        },
        tooltip: {
          trigger: 'axis',
          axisPointer: {
            type: 'shadow',
            shadowStyle: { color: 'rgba(255,255,255,0.035)' },
          },
          backgroundColor: 'rgba(11, 18, 38, 0.96)',
          borderColor: 'rgba(74, 163, 255, 0.35)',
          borderWidth: 1,
          textStyle: {
            color: '#eef1ff',
            fontFamily: 'DM Sans, system-ui, sans-serif',
            fontSize: 12,
          },
          formatter(rawParams: unknown) {
            const list = Array.isArray(rawParams) ? rawParams : [rawParams];
            const first = list[0] as { axisValueLabel?: string } | undefined;
            const catTitle = first?.axisValueLabel ?? '';
            const lines = list
              .map((p) => {
                const item = p as {
                  seriesName?: string;
                  value?: number;
                  color?: string;
                };
                const val = typeof item.value === 'number' ? item.value : 0;
                return (
                  `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11.5px;margin-top:2px">` +
                  `<span style="color:#b4bbd8"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeHtml(String(item.color ?? '#3987e5'))};margin-right:6px"></span>${escapeHtml(item.seriesName ?? '')}</span>` +
                  `<span style="font-weight:600;color:${val < 0 ? '#fda4af' : '#eef1ff'};font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(val, currency))}</span>` +
                  `</div>`
                );
              })
              .join('');
            return `<div style="min-width:240px"><div style="font-weight:600;color:#fff;margin-bottom:5px">${escapeHtml(catTitle)}</div>${lines}</div>`;
          },
        },
        xAxis: {
          type: 'category',
          data: chartData.kpiCategories,
          axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
          axisTick: { show: false },
          axisLabel: { color: '#b4bbd8', fontSize: 11 },
        },
        yAxis: {
          type: 'value',
          splitLine: {
            lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' },
          },
          axisLabel: {
            color: '#8a93b5',
            fontSize: 11,
            formatter(value: number) {
              return formatMoneyCompact(value);
            },
          },
        },
        series: chartData.kpiSeries.map((sc) => ({
          name: sc.name,
          type: 'bar' as const,
          barMaxWidth: 28,
          data: sc.values,
          itemStyle: {
            color: sc.colorHex,
            opacity: 0.9,
            borderRadius: [3, 3, 0, 0],
          },
        })),
      };
    }

    const periods = chartData.periodHeaders;
    const multiYear = periods.length > 12;
    const xLabels = periods.map((p) => formatPeriodShort(p, multiYear));
    const activeLines =
      mode === 'overdraft' ? chartData.overdraftLines : chartData.netIncomeLines;

    const markLineItems =
      mode === 'overdraft' && chartData.overdraftLimit > 0
        ? [
            {
              yAxis: chartData.overdraftLimit,
              lineStyle: { color: '#f0645f', type: 'dashed', width: 1.5 },
              label: {
                formatter: `Limit OD: ${formatMoneyCompact(chartData.overdraftLimit)}`,
                color: '#fda4af',
                backgroundColor: 'rgba(11, 18, 38, 0.85)',
                padding: [2, 6],
                borderRadius: 4,
                fontSize: 10,
                position: 'insideEndTop',
              },
            },
          ]
        : mode === 'net'
          ? [
              {
                yAxis: 0,
                lineStyle: { color: 'rgba(255,255,255,0.3)', type: 'solid', width: 1 },
                label: { show: false },
              },
            ]
          : [];

    return {
      animationDuration: 320,
      grid: { left: 70, right: 20, top: 46, bottom: 34 },
      legend: {
        top: 0,
        textStyle: {
          color: '#b4bbd8',
          fontSize: 11,
          fontFamily: 'DM Sans, system-ui, sans-serif',
        },
        itemWidth: 14,
        itemHeight: 10,
        itemGap: 14,
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(11, 18, 38, 0.96)',
        borderColor: 'rgba(74, 163, 255, 0.35)',
        borderWidth: 1,
        textStyle: {
          color: '#eef1ff',
          fontFamily: 'DM Sans, system-ui, sans-serif',
          fontSize: 12,
        },
        formatter(rawParams: unknown) {
          const list = Array.isArray(rawParams) ? rawParams : [rawParams];
          const first = list[0] as { dataIndex?: number } | undefined;
          const idx = first?.dataIndex ?? -1;
          const periodTitle = formatPeriodLong(periods[idx] ?? '');
          const lines = list
            .map((p) => {
              const item = p as {
                seriesName?: string;
                value?: number;
                color?: string;
              };
              const val = typeof item.value === 'number' ? item.value : 0;
              return (
                `<div style="display:flex;justify-content:space-between;gap:16px;font-size:11.5px;margin-top:2px">` +
                `<span style="color:#b4bbd8"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${escapeHtml(String(item.color ?? '#3987e5'))};margin-right:6px"></span>${escapeHtml(item.seriesName ?? '')}</span>` +
                `<span style="font-weight:600;color:${val < 0 ? '#fda4af' : '#eef1ff'};font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(val, currency))}</span>` +
                `</div>`
              );
            })
            .join('');
          return `<div style="min-width:240px"><div style="font-weight:600;color:#fff;margin-bottom:5px">${escapeHtml(periodTitle)}</div>${lines}</div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
        axisTick: { show: false },
        axisLabel: { color: '#b4bbd8', fontSize: 11 },
      },
      yAxis: {
        type: 'value',
        ...(mode === 'overdraft' && chartData.overdraftLimit > 0
          ? {
              max(val: { min: number; max: number }) {
                return Math.max(val.max, chartData.overdraftLimit * 1.05);
              },
            }
          : {}),
        splitLine: {
          lineStyle: { color: 'rgba(255,255,255,0.06)', type: 'dashed' },
        },
        axisLabel: {
          color: '#8a93b5',
          fontSize: 11,
          formatter(value: number) {
            return formatMoneyCompact(value);
          },
        },
      },
      series: activeLines.map((sc, idx) => ({
        name: sc.name,
        type: 'line' as const,
        data: sc.values,
        smooth: 0.15,
        symbol: 'circle',
        symbolSize: 5,
        lineStyle: {
          color: sc.colorHex,
          width: idx === 0 ? 2.5 : 2,
          type: idx === 0 ? ('solid' as const) : ('solid' as const),
        },
        itemStyle: { color: sc.colorHex },
        ...(idx === 0 && markLineItems.length > 0
          ? {
              markLine: {
                silent: true,
                symbol: 'none',
                data: markLineItems as never,
              },
            }
          : {}),
      })),
    };
  }, [scenarios, mode, chartData, currency]);

  const { containerRef, exportPng } = useEChart({ option });

  return (
    <EChartContainer
      title="Wizualne porównanie scenariuszy (Side-by-Side)"
      subtitle={`Zestawienie ${scenarios.length} wybranych wariantów — przełącz metrykę u góry po prawej.`}
      headerRight={
        <div
          role="group"
          aria-label="Tryb wykresu porównania scenariuszy"
          className="inline-flex rounded-full border border-white/15 bg-white/[0.04] p-0.5 text-xs"
        >
          {CHART_MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={cn(
                'cursor-pointer rounded-full px-2.5 py-1 font-medium transition',
                mode === m.id
                  ? 'bg-sky-500/30 text-white'
                  : 'text-[var(--ink-muted)] hover:text-white',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
      containerRef={containerRef}
      onExportPng={() => exportPng(`finpulse-porownanie-scenariuszy-${mode}.png`)}
      heightClass="h-[360px]"
      isEmpty={scenarios.length === 0}
      emptyMessage="Zaznacz przynajmniej jeden scenariusz na liście powyżej."
    />
  );
}
