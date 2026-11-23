import { useCallback, useMemo } from 'react';
import { EChartContainer } from '@/components/charts/EChartContainer';
import type { ProfitabilityCashflowSeries } from '@/engine/financialsAnalytics';
import { useEChart } from '@/hooks/useEChart';
import {
  escapeHtml,
  type ECElementEvent,
  type FinPulseEChartOption,
} from '@/lib/echarts';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPeriodLong,
  formatPeriodShort,
} from '@/utils/formatters';

interface ProfitabilityCashflowChartProps {
  series: ProfitabilityCashflowSeries;
  currency: string;
  selectedPeriod: number;
  onSelectPeriod: (periodIdx: number) => void;
}

export function ProfitabilityCashflowChart({
  series,
  currency,
  selectedPeriod,
  onSelectPeriod,
}: ProfitabilityCashflowChartProps) {
  const handleChartClick = useCallback(
    (params: ECElementEvent) => {
      if (
        typeof params.dataIndex === 'number' &&
        params.dataIndex >= 0 &&
        params.dataIndex < series.periodHeaders.length
      ) {
        onSelectPeriod(params.dataIndex);
      }
    },
    [onSelectPeriod, series.periodHeaders.length],
  );

  const option = useMemo<FinPulseEChartOption | null>(() => {
    const periods = series.periodHeaders;
    if (periods.length === 0) return null;
    const multiYear = periods.length > 12;
    const xLabels = periods.map((p) => formatPeriodShort(p, multiYear));

    return {
      animationDuration: 350,
      grid: {
        left: 68,
        right: 22,
        top: 44,
        bottom: 34,
      },
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
          const first = list[0] as { dataIndex?: number } | undefined;
          const idx = first?.dataIndex ?? -1;
          if (idx < 0 || idx >= periods.length) return '';

          const title = formatPeriodLong(periods[idx] ?? '');
          const rev = series.revenueSeries[idx] ?? 0;
          const ebitda = series.ebitdaSeries[idx] ?? 0;
          const net = series.netIncomeSeries[idx] ?? 0;
          const cfo = series.cfoSeries[idx] ?? 0;

          const row = (color: string, name: string, val: number, emphasize = false) =>
            `<div style="display:flex;justify-content:space-between;gap:14px;font-size:11.5px;${emphasize ? 'font-weight:700;' : ''}">` +
            `<span style="color:#b4bbd8"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${color};margin-right:6px"></span>${escapeHtml(name)}</span>` +
            `<span style="font-variant-numeric:tabular-nums;color:${val >= 0 ? '#eef1ff' : '#fda4af'}">${escapeHtml(formatMoneyFull(val, currency))}</span>` +
            `</div>`;

          return [
            `<div style="min-width:245px">`,
            `<div style="font-weight:600;color:#fff;margin-bottom:6px">${escapeHtml(title)}</div>`,
            row('#eef1ff', 'Przychody', rev),
            row('#6877eb', 'EBITDA', ebitda, true),
            row('#2fd1a0', 'Przepływy operacyjne (CFO)', cfo, true),
            row('#f0645f', 'Wynik netto', net),
            `</div>`,
          ].join('');
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
      series: [
        {
          name: 'EBITDA',
          type: 'bar',
          barMaxWidth: 20,
          data: series.ebitdaSeries,
          itemStyle: { color: '#6877eb', opacity: 0.88, borderRadius: [3, 3, 0, 0] },
          ...(selectedPeriod >= 0 && selectedPeriod < periods.length
            ? {
                markArea: {
                  silent: true,
                  itemStyle: {
                    color: 'rgba(74, 163, 255, 0.1)',
                    borderColor: 'rgba(74, 163, 255, 0.4)',
                    borderWidth: 1,
                  },
                  data: [
                    [{ xAxis: selectedPeriod }, { xAxis: selectedPeriod }] as [
                      { xAxis: number },
                      { xAxis: number },
                    ],
                  ],
                },
              }
            : {}),
        },
        {
          name: 'CFO operacyjne',
          type: 'bar',
          barMaxWidth: 20,
          data: series.cfoSeries,
          itemStyle: { color: '#2fd1a0', opacity: 0.85, borderRadius: [3, 3, 0, 0] },
        },
        {
          name: 'Przychody',
          type: 'line',
          data: series.revenueSeries,
          smooth: 0.15,
          symbol: 'none',
          lineStyle: { color: '#eef1ff', width: 2, type: 'dashed' },
          itemStyle: { color: '#eef1ff' },
          z: 10,
        },
        {
          name: 'Wynik netto',
          type: 'line',
          data: series.netIncomeSeries,
          smooth: 0.15,
          symbol: 'circle',
          symbolSize: 5,
          lineStyle: { color: '#f0645f', width: 2.2 },
          itemStyle: { color: '#f0645f' },
          z: 11,
        },
      ],
    };
  }, [series, currency, selectedPeriod]);

  const { containerRef, exportPng } = useEChart({
    option,
    onClick: handleChartClick,
  });

  return (
    <EChartContainer
      title="Przychody, EBITDA, Wynik netto i Przepływy operacyjne (CFO)"
      subtitle="Porównanie wyniku memoriałowego z generacją gotówki operacyjnej miesiąc po miesiącu."
      containerRef={containerRef}
      onExportPng={() => exportPng('finpulse-wyniki-vs-cfo.png')}
      heightClass="h-[340px]"
      isEmpty={series.periodHeaders.length === 0}
    />
  );
}
