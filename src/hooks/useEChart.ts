import { useCallback, useEffect, useRef } from 'react';
import {
  init,
  type ECElementEvent,
  type ECharts,
  type FinPulseEChartOption,
} from '@/lib/echarts';

export interface UseEChartParams {
  option: FinPulseEChartOption | null;
  onClick?: (params: ECElementEvent) => void;
}

export function useEChart({ option, onClick }: UseEChartParams) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<ECharts | null>(null);
  const onClickRef = useRef<UseEChartParams['onClick']>(onClick);
  onClickRef.current = onClick;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const handleClick = (params: ECElementEvent) => {
      onClickRef.current?.(params);
    };
    chart.on('click', handleClick);

    const observer = new ResizeObserver(() => {
      if (chartRef.current && !chartRef.current.isDisposed()) {
        chartRef.current.resize();
      }
    });
    observer.observe(el);

    return () => {
      observer.disconnect();
      chart.off('click', handleClick);
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed() || !option) return;
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
  }, [option]);

  const exportPng = useCallback((fileName: string) => {
    const chart = chartRef.current;
    if (!chart || chart.isDisposed()) return;
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#0b1226',
    });
    const link = document.createElement('a');
    const safeName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
    link.href = url;
    link.download = safeName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }, []);

  return { containerRef, exportPng };
}
