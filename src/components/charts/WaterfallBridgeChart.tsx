import { useMemo } from 'react';
import { EChartContainer } from '@/components/charts/EChartContainer';
import type { WaterfallStep, WaterfallStepKind } from '@/engine/costAnalytics';
import { useEChart } from '@/hooks/useEChart';
import { escapeHtml, type FinPulseEChartOption } from '@/lib/echarts';
import { formatMoneyCompact, formatMoneyFull } from '@/utils/formatters';

interface WaterfallBridgeChartProps {
  steps: WaterfallStep[];
  currency: string;
  periodLabel: string;
  periodSlug: string;
}

const KIND_CODE: Record<WaterfallStepKind, number> = {
  start: 0,
  pos: 1,
  neg: 2,
  subtotal: 3,
  end: 4,
};

function resolveBarColor(kindCode: number, runningAfter: number): string {
  switch (kindCode) {
    case 0:
      return '#3987e5'; // START
    case 1:
      return '#2fd1a0'; // DELTA_POS
    case 2:
      return '#f0645f'; // DELTA_NEG
    case 3:
      return '#6877eb'; // SUBTOTAL
    case 4:
    default:
      return runningAfter >= 0 ? '#2fd1a0' : '#f0645f'; // END
  }
}

export function WaterfallBridgeChart({
  steps,
  currency,
  periodLabel,
  periodSlug,
}: WaterfallBridgeChartProps) {
  const option = useMemo<FinPulseEChartOption | null>(() => {
    if (steps.length === 0) return null;

    const categories = steps.map((s) => s.shortLabel);
    const dataMinRaw = Math.min(0, ...steps.map((s) => s.yLow));
    const dataMaxRaw = Math.max(0, ...steps.map((s) => s.yHigh));
    const span = Math.max(1000, dataMaxRaw - dataMinRaw);
    const yMin = dataMinRaw < 0 ? dataMinRaw - span * 0.18 : 0;
    const yMax = dataMaxRaw + span * 0.16;

    const seriesData = steps.map((s, idx) => [
      idx,
      s.yLow,
      s.yHigh,
      s.signedDelta,
      s.runningAfter,
      KIND_CODE[s.kind],
      idx === steps.length - 1 ? 1 : 0,
      s.from,
      s.to,
    ]);

    return {
      animationDuration: 350,
      grid: {
        left: 72,
        right: 24,
        top: 28,
        bottom: 58,
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow',
          shadowStyle: { color: 'rgba(255,255,255,0.04)' },
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
          const step = steps[idx];
          if (!step) return '';

          const isBridgePoint =
            step.kind === 'start' || step.kind === 'subtotal' || step.kind === 'end';
          const valueLabel = isBridgePoint ? 'Wartość' : 'Wpływ na wynik';
          const deltaStr = isBridgePoint
            ? formatMoneyFull(step.runningAfter, currency)
            : `${step.signedDelta >= 0 ? '+' : '−'}${formatMoneyFull(Math.abs(step.signedDelta), currency)}`;

          const deltaColor =
            step.kind === 'start' || step.kind === 'subtotal'
              ? '#9cc6ff'
              : (isBridgePoint ? step.runningAfter : step.signedDelta) >= 0
                ? '#2fd1a0'
                : '#f0645f';

          return [
            `<div style="min-width:220px">`,
            `<div style="font-weight:600;color:#fff;margin-bottom:6px">${escapeHtml(step.label)}</div>`,
            `<div style="display:flex;justify-content:space-between;gap:14px;margin-bottom:3px">`,
            `<span style="color:#b4bbd8">${valueLabel}:</span>`,
            `<span style="font-weight:700;color:${deltaColor};font-variant-numeric:tabular-nums">${escapeHtml(deltaStr)}</span>`,
            `</div>`,
            !isBridgePoint
              ? `<div style="display:flex;justify-content:space-between;gap:14px">` +
                `<span style="color:#b4bbd8">Saldo po pozycji:</span>` +
                `<span style="font-weight:600;color:#eef1ff;font-variant-numeric:tabular-nums">${escapeHtml(formatMoneyFull(step.runningAfter, currency))}</span>` +
                `</div>`
              : '',
            `</div>`,
          ].join('');
        },
      },
      xAxis: {
        type: 'category',
        data: categories,
        axisLine: { lineStyle: { color: 'rgba(255,255,255,0.16)' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#b4bbd8',
          fontSize: 11,
          interval: 0,
          rotate: steps.length > 10 ? 28 : 0,
        },
      },
      yAxis: {
        type: 'value',
        min: yMin,
        max: yMax,
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
          name: 'Mostek wyniku',
          type: 'custom',
          renderItem(params, api) {
            const idx = Number(api.value(0));
            const yLow = Number(api.value(1));
            const yHigh = Number(api.value(2));
            const signedDelta = Number(api.value(3));
            const runningAfter = Number(api.value(4));
            const kindCode = Number(api.value(5));
            const isLast = Number(api.value(6)) === 1;
            const toVal = Number(api.value(8));

            const topPt = api.coord([idx, yHigh]);
            const botPt = api.coord([idx, yLow]);
            const catSize = api.size ? (api.size([1, 0]) as number[]) : [40, 0];
            const bandW = catSize[0] ?? 40;
            const barW = Math.min(44, Math.max(12, bandW * 0.6));

            const rawHeight = botPt[1] - topPt[1];
            const barHeight = Math.max(3, rawHeight);
            const barY = rawHeight < 3 ? topPt[1] - (3 - rawHeight) / 2 : topPt[1];
            const barX = topPt[0] - barW / 2;

            const fill = resolveBarColor(kindCode, runningAfter);
            const isBridgeTotal = kindCode === 0 || kindCode === 3 || kindCode === 4;
            const placeAbove = isBridgeTotal ? toVal >= 0 : signedDelta >= 0;

            const labelText = isBridgeTotal
              ? formatMoneyCompact(runningAfter)
              : `${signedDelta >= 0 ? '+' : '−'}${formatMoneyCompact(Math.abs(signedDelta))}`;

            const children: Array<Record<string, unknown>> = [];

            if (!isLast) {
              const connStart = api.coord([idx, runningAfter]);
              const connEnd = api.coord([idx + 1, runningAfter]);
              children.push({
                type: 'line',
                silent: true,
                shape: {
                  x1: connStart[0] + barW / 2,
                  y1: connStart[1],
                  x2: connEnd[0] - barW / 2,
                  y2: connEnd[1],
                },
                style: {
                  stroke: 'rgba(180, 187, 216, 0.32)',
                  lineWidth: 1,
                  lineDash: [3, 3],
                },
              });
            }

            children.push({
              type: 'rect',
              shape: {
                x: barX,
                y: barY,
                width: barW,
                height: barHeight,
                r: 4,
              },
              style: {
                fill,
                opacity: 0.92,
              },
              emphasis: {
                style: {
                  opacity: 1,
                  shadowBlur: 12,
                  shadowColor: 'rgba(74, 163, 255, 0.35)',
                },
              },
            });

            children.push({
              type: 'text',
              silent: true,
              style: {
                text: labelText,
                x: topPt[0],
                y: placeAbove ? barY - 6 : barY + barHeight + 6,
                textAlign: 'center',
                textVerticalAlign: placeAbove ? 'bottom' : 'top',
                fill: isBridgeTotal ? '#eef1ff' : fill,
                fontSize: 10.5,
                fontWeight: 600,
                fontFamily: 'DM Sans, system-ui, sans-serif',
              },
            });

            return {
              type: 'group',
              children,
            } as never;
          },
          encode: {
            x: 0,
            y: [1, 2],
          },
          data: seriesData,
          markLine: {
            silent: true,
            symbol: 'none',
            label: { show: false },
            lineStyle: {
              color: 'rgba(255, 255, 255, 0.28)',
              width: 1,
              type: 'solid',
            },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    };
  }, [steps, currency]);

  const { containerRef, exportPng } = useEChart({ option });

  return (
    <EChartContainer
      title={`Mostek wyniku (Waterfall) · ${periodLabel}`}
      subtitle="Od przychodów przez marżę zmienną, koszty stałe i dotację do EBITDA, EBIT i wyniku netto (z 04_RZiS)."
      headerRight={
        <div className="hidden items-center gap-3 text-[11px] text-[var(--ink-muted)] sm:flex">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#3987e5]" />
            Sumy / Marże
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#2fd1a0]" />
            Wpływ dodatni
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm bg-[#f0645f]" />
            Koszty / Podatek
          </span>
        </div>
      }
      containerRef={containerRef}
      onExportPng={() => exportPng(`finpulse-mostek-${periodSlug}.png`)}
      heightClass="h-[370px]"
      isEmpty={steps.length === 0}
      emptyMessage="Brak ról WF_ROLE w arkuszu 04_RZiS do zbudowania mostka wyniku."
    />
  );
}
