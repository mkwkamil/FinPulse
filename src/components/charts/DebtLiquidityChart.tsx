import { useCallback, useMemo } from 'react';
import { EChartContainer } from '@/components/charts/EChartContainer';
import type { DebtLiquiditySeries } from '@/engine/financialsAnalytics';
import { useEChart } from '@/hooks/useEChart';
import {
  escapeHtml,
  type ECElementEvent,
  type FinPulseEChartOption,
} from '@/lib/echarts';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPercent,
  formatPeriodLong,
  formatPeriodShort,
} from '@/utils/formatters';

interface DebtLiquidityChartProps {
  series: DebtLiquiditySeries;
  currency: string;
  selectedPeriod: number;
  isSimulationActive: boolean;
  onSelectPeriod: (periodIdx: number) => void;
}

export function DebtLiquidityChart({
  series,
  currency,
  selectedPeriod,
  isSimulationActive,
  onSelectPeriod,
}: DebtLiquidityChartProps) {
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

    const hasLoan = series.loanSeries.some((v) => Math.abs(v) > 0.5);
    const hasShLoan = series.shareholderLoanSeries.some((v) => Math.abs(v) > 0.5);

    const markLineItems: Array<Record<string, unknown>> = [];
    if (series.overdraftLimit > 0) {
      markLineItems.push({
        yAxis: series.overdraftLimit,
        name: 'Limit overdraftu',
        lineStyle: {
          color: '#f0645f',
          type: 'dashed',
          width: 1.5,
        },
        label: {
          formatter: `Limit OD: ${formatMoneyCompact(series.overdraftLimit)}`,
          color: '#fda4af',
          backgroundColor: 'rgba(11, 18, 38, 0.85)',
          padding: [2, 6],
          borderRadius: 4,
          fontSize: 10,
          position: 'insideEndTop',
        },
      });
    }
    if (series.minCash > 0) {
      markLineItems.push({
        yAxis: series.minCash,
        name: 'Min. gotówka',
        lineStyle: {
          color: '#2fd1a0',
          type: 'dotted',
          width: 1.3,
        },
        label: {
          formatter: `Min. gotówka: ${formatMoneyCompact(series.minCash)}`,
          color: '#6ee7b7',
          backgroundColor: 'rgba(11, 18, 38, 0.85)',
          padding: [2, 6],
          borderRadius: 4,
          fontSize: 10,
          position: 'insideStartTop',
        },
      });
    }

    const activeMarkArea =
      selectedPeriod >= 0 && selectedPeriod < periods.length
        ? {
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
          }
        : undefined;

    return {
      animationDuration: 350,
      grid: {
        left: 68,
        right: 22,
        top: 46,
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
          const loan = series.loanSeries[idx] ?? 0;
          const ov = series.overdraftSeries[idx] ?? 0;
          const baseOv = series.baseOverdraftSeries[idx] ?? ov;
          const sh = series.shareholderLoanSeries[idx] ?? 0;
          const cash = series.cashSeries[idx] ?? 0;
          const grossDebt = loan + ov + sh;
          const netDebt = grossDebt - cash;
          const util = series.overdraftLimit > 0 ? ov / series.overdraftLimit : 0;

          const rowLine = (dotColor: string, label: string, val: string, bold = false) =>
            `<div style="display:flex;justify-content:space-between;gap:14px;font-size:11.5px;${bold ? 'font-weight:700;color:#fff;' : ''}">` +
            `<span><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:${dotColor};margin-right:6px"></span>${escapeHtml(label)}</span>` +
            `<span style="font-variant-numeric:tabular-nums">${escapeHtml(val)}</span>` +
            `</div>`;

          return [
            `<div style="min-width:265px">`,
            `<div style="font-weight:600;color:#fff;margin-bottom:6px">${escapeHtml(title)}</div>`,
            hasLoan ? rowLine('#3987e5', 'Kredyt inwestycyjny', formatMoneyFull(loan, currency)) : '',
            rowLine(
              '#f59e0b',
              `Overdraft (${formatPercent(util, 1)} limitu)`,
              formatMoneyFull(ov, currency),
            ),
            isSimulationActive && Math.abs(ov - baseOv) >= 1
              ? rowLine('#ffd36b', 'Overdraft bazowy', formatMoneyFull(baseOv, currency))
              : '',
            sh > 0.5 || hasShLoan
              ? rowLine('#f0645f', 'Pożyczka wspólników', formatMoneyFull(sh, currency), sh > 0.5)
              : '',
            rowLine('#2fd1a0', 'Środki pieniężne', formatMoneyFull(cash, currency)),
            `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.12);display:flex;justify-content:space-between;gap:14px;font-weight:700">` +
              `<span style="color:#b4bbd8">Dług netto:</span>` +
              `<span style="color:#9cc6ff;font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(netDebt, currency))}</span>` +
              `</div>`,
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
        max(val: { min: number; max: number }) {
          return series.overdraftLimit > 0
            ? Math.max(val.max, series.overdraftLimit * 1.06)
            : val.max;
        },
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
        ...(hasLoan
          ? [
              {
                name: 'Kredyt inwestycyjny',
                type: 'bar' as const,
                stack: 'debt',
                barMaxWidth: 36,
                data: series.loanSeries,
                itemStyle: { color: '#3987e5', opacity: 0.9 },
                markArea: activeMarkArea,
              },
            ]
          : []),
        {
          name: 'Overdraft',
          type: 'bar' as const,
          stack: 'debt',
          barMaxWidth: 36,
          data: series.overdraftSeries,
          itemStyle: {
            color: '#f59e0b',
            opacity: 0.92,
            borderRadius: hasShLoan ? [0, 0, 0, 0] : [4, 4, 0, 0],
          },
          ...(!hasLoan && activeMarkArea ? { markArea: activeMarkArea } : {}),
        },
        ...(hasShLoan
          ? [
              {
                name: 'Pożyczka wspólników',
                type: 'bar' as const,
                stack: 'debt',
                barMaxWidth: 36,
                data: series.shareholderLoanSeries,
                itemStyle: { color: '#f0645f', opacity: 0.95, borderRadius: [4, 4, 0, 0] },
              },
            ]
          : []),
        {
          name: 'Środki pieniężne',
          type: 'line' as const,
          data: series.cashSeries,
          smooth: 0.15,
          symbol: 'circle',
          symbolSize: 6,
          lineStyle: { color: '#2fd1a0', width: 2.5 },
          itemStyle: { color: '#2fd1a0' },
          z: 10,
          ...(markLineItems.length > 0
            ? {
                markLine: {
                  silent: true,
                  symbol: 'none',
                  data: markLineItems as never,
                },
              }
            : {}),
        },
        ...(isSimulationActive
          ? [
              {
                name: 'Overdraft bazowy',
                type: 'line' as const,
                data: series.baseOverdraftSeries,
                smooth: 0.15,
                symbol: 'none',
                lineStyle: { color: '#ffd36b', width: 2, type: 'dotted' as const },
                itemStyle: { color: '#ffd36b' },
                z: 11,
              },
            ]
          : []),
      ],
    };
  }, [series, currency, selectedPeriod, isSimulationActive]);

  const { containerRef, exportPng } = useEChart({
    option,
    onClick: handleChartClick,
  });

  return (
    <EChartContainer
      title="Struktura długu, limit overdraftu i gotówka"
      subtitle="Skumulowane finansowanie na koniec miesiąca względem limitu overdraftu i minimalnej gotówki. Kliknij miesiąc, aby wybrać okres."
      containerRef={containerRef}
      onExportPng={() => exportPng('finpulse-zadluzenie-plynnosc.png')}
      heightClass="h-[340px]"
      isEmpty={series.periodHeaders.length === 0}
    />
  );
}
