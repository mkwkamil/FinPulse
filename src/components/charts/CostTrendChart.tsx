import { useCallback, useMemo } from 'react';
import { EChartContainer } from '@/components/charts/EChartContainer';
import type { MonthlyTrendData } from '@/engine/costAnalytics';
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

interface CostTrendChartProps {
  trend: MonthlyTrendData;
  currency: string;
  selectedPeriod: number;
  selectedDeptCode: string | null;
  isSimulationActive: boolean;
  onSelectPeriod: (periodIdx: number) => void;
}

export function CostTrendChart({
  trend,
  currency,
  selectedPeriod,
  selectedDeptCode,
  isSimulationActive,
  onSelectPeriod,
}: CostTrendChartProps) {
  const handleChartClick = useCallback(
    (params: ECElementEvent) => {
      if (
        typeof params.dataIndex === 'number' &&
        params.dataIndex >= 0 &&
        params.dataIndex < trend.periodHeaders.length
      ) {
        onSelectPeriod(params.dataIndex);
      }
    },
    [onSelectPeriod, trend.periodHeaders.length],
  );

  const option = useMemo<FinPulseEChartOption | null>(() => {
    const periods = trend.periodHeaders;
    if (periods.length === 0) return null;
    const multiYear = periods.length > 12;
    const xLabels = periods.map((p) => formatPeriodShort(p, multiYear));

    const barSeries = trend.deptSeries.map((dept, idx) => {
      const isDimmed = selectedDeptCode !== null && selectedDeptCode !== dept.deptCode;
      return {
        name: dept.deptName,
        type: 'bar' as const,
        stack: 'depts',
        barMaxWidth: 38,
        data: dept.values,
        itemStyle: {
          color: dept.colorHex,
          opacity: isDimmed ? 0.2 : 0.92,
          borderRadius: idx === trend.deptSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0],
        },
        emphasis: {
          focus: 'series' as const,
        },
        ...(idx === 0 && selectedPeriod >= 0 && selectedPeriod < periods.length
          ? {
              markArea: {
                silent: true,
                itemStyle: {
                  color: 'rgba(74, 163, 255, 0.1)',
                  borderColor: 'rgba(74, 163, 255, 0.45)',
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
      };
    });

    const lineSeries = [
      {
        name: 'Przychody',
        type: 'line' as const,
        data: trend.revenueSeries,
        smooth: 0.15,
        symbol: 'circle',
        symbolSize: 6,
        lineStyle: {
          color: '#eef1ff',
          width: 2.5,
          type: 'dashed' as const,
        },
        itemStyle: {
          color: '#eef1ff',
        },
        z: 10,
      },
      ...(isSimulationActive
        ? [
            {
              name: 'Koszty bazowe (budżet)',
              type: 'line' as const,
              data: trend.baseTotalCostSeries,
              smooth: 0.15,
              symbol: 'none',
              lineStyle: {
                color: '#ffd36b',
                width: 2,
                type: 'dotted' as const,
              },
              itemStyle: {
                color: '#ffd36b',
              },
              z: 11,
            },
          ]
        : []),
    ];

    return {
      animationDuration: 350,
      grid: {
        left: 68,
        right: 20,
        top: 44,
        bottom: 36,
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
          const rev = trend.revenueSeries[idx] ?? 0;
          const tot = trend.totalCostSeries[idx] ?? 0;
          const baseTot = trend.baseTotalCostSeries[idx] ?? tot;
          const net = trend.netIncomeSeries[idx] ?? 0;
          const deltaCost = tot - baseTot;

          const deptLines = trend.deptSeries
            .map((d) => ({
              name: d.deptName,
              color: d.colorHex,
              val: d.values[idx] ?? 0,
              code: d.deptCode,
            }))
            .sort((a, b) => b.val - a.val)
            .map((d) => {
              const bold = selectedDeptCode === d.code ? 'font-weight:700;color:#fff;' : '';
              return `<div style="display:flex;justify-content:space-between;gap:14px;font-size:11px;${bold}">` +
                `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${escapeHtml(d.color)};margin-right:6px"></span>${escapeHtml(d.name)}</span>` +
                `<span style="font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(d.val, currency))}</span>` +
                `</div>`;
            })
            .join('');

          const netColor = net >= 0 ? '#2fd1a0' : '#f0645f';
          const deltaLine =
            isSimulationActive && Math.abs(deltaCost) >= 1
              ? `<div style="display:flex;justify-content:space-between;gap:14px;font-size:11px;color:#ffd36b">` +
                `<span>Δ Koszty vs budżet:</span>` +
                `<span style="font-variant-numeric:tabular-nums">${deltaCost >= 0 ? '+' : '−'}${escapeHtml(formatMoneyFull(Math.abs(deltaCost), currency))}</span>` +
                `</div>`
              : '';

          return [
            `<div style="min-width:255px">`,
            `<div style="font-weight:600;color:#fff;margin-bottom:6px">${escapeHtml(title)}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:14px">` +
              `<span style="color:#b4bbd8">Przychody:</span>` +
              `<span style="font-weight:600;color:#fff;font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(rev, currency))}</span>` +
              `</div>`,
            `<div style="display:flex;justify-content:space-between;gap:14px">` +
              `<span style="color:#b4bbd8">Koszty razem:</span>` +
              `<span style="font-weight:600;color:#fff;font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(tot, currency))}</span>` +
              `</div>`,
            deltaLine,
            `<div style="display:flex;justify-content:space-between;gap:14px;margin-bottom:6px;padding-bottom:6px;border-bottom:1px solid rgba(255,255,255,0.12)">` +
              `<span style="color:#b4bbd8">Wynik netto:</span>` +
              `<span style="font-weight:700;color:${netColor};font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(net, currency))}</span>` +
              `</div>`,
            deptLines,
            `</div>`,
          ].join('');
        },
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#b4bbd8',
          fontSize: 11,
        },
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
      series: [...barSeries, ...lineSeries],
    };
  }, [trend, currency, selectedPeriod, selectedDeptCode, isSimulationActive]);

  const { containerRef, exportPng } = useEChart({
    option,
    onClick: handleChartClick,
  });

  return (
    <EChartContainer
      title="Trend miesięczny kosztów działów vs przychody"
      subtitle="Kliknij dowolny słupek miesiąca, aby przełączyć aktywny okres na całym dashboardzie."
      containerRef={containerRef}
      onExportPng={() => exportPng('finpulse-trend-kosztow.png')}
      heightClass="h-[360px]"
      isEmpty={trend.periodHeaders.length === 0}
    />
  );
}
