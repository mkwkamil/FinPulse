import { useMemo } from 'react';
import { FilterX, SlidersHorizontal } from 'lucide-react';
import { CostTrendChart } from '@/components/charts/CostTrendChart';
import { WaterfallBridgeChart } from '@/components/charts/WaterfallBridgeChart';
import { AllocationHeatmapTable } from '@/components/costs/AllocationHeatmapTable';
import { AllocationKeysAccordion } from '@/components/costs/AllocationKeysAccordion';
import { CategoryBreakdown } from '@/components/costs/CategoryBreakdown';
import { CostKpiStrip } from '@/components/costs/CostKpiStrip';
import { DepartmentBreakdown } from '@/components/costs/DepartmentBreakdown';
import { InsightsPanel } from '@/components/costs/InsightsPanel';
import { MonthlyDeptTable } from '@/components/costs/MonthlyDeptTable';
import {
  computeCategoryBreakdown,
  computeCostKpis,
  computeDeptBreakdown,
  computeHeatmapMatrix,
  computeMonthlyTrendSeries,
  computeWaterfallSteps,
} from '@/engine/costAnalytics';
import { generateCostInsights } from '@/engine/insightsEngine';
import { useFinPulseStore } from '@/store/useFinPulseStore';
import { formatPeriodLong } from '@/utils/formatters';

export function CostsDashboardView() {
  const activeDomain = useFinPulseStore((s) => s.activeDomain);
  const baseDomain = useFinPulseStore((s) => s.baseDomain);
  const activeAudit = useFinPulseStore((s) => s.activeAudit);
  const selectedPeriod = useFinPulseStore((s) => s.selectedPeriod);
  const selectedDeptCode = useFinPulseStore((s) => s.selectedDeptCode);
  const isSimulationActive = useFinPulseStore((s) => s.isSimulationActive);

  const setSelectedPeriod = useFinPulseStore((s) => s.setSelectedPeriod);
  const setSelectedDeptCode = useFinPulseStore((s) => s.setSelectedDeptCode);
  const setDrawerOpen = useFinPulseStore((s) => s.setDrawerOpen);

  const periodHeaders = activeDomain?.metadata.periodHeaders ?? [];
  const isAnnual = selectedPeriod < 0;
  const periodLabel = isAnnual
    ? `Cały okres (${periodHeaders.length}M)`
    : formatPeriodLong(periodHeaders[selectedPeriod] ?? '');
  const periodSlug = isAnnual
    ? `caly-okres-${periodHeaders.length}m`
    : (periodHeaders[selectedPeriod] ?? `m${selectedPeriod + 1}`).toLowerCase();

  const toggleDept = (deptCode: string) => {
    setSelectedDeptCode(selectedDeptCode === deptCode ? null : deptCode);
  };

  const kpis = useMemo(
    () =>
      activeDomain
        ? computeCostKpis(activeDomain, baseDomain, selectedPeriod)
        : null,
    [activeDomain, baseDomain, selectedPeriod],
  );

  const deptBreakdown = useMemo(
    () =>
      activeDomain
        ? computeDeptBreakdown(activeDomain, baseDomain, selectedPeriod)
        : [],
    [activeDomain, baseDomain, selectedPeriod],
  );

  const categoryBreakdown = useMemo(
    () =>
      activeDomain
        ? computeCategoryBreakdown(
            activeDomain,
            baseDomain,
            selectedPeriod,
            selectedDeptCode,
          )
        : [],
    [activeDomain, baseDomain, selectedPeriod, selectedDeptCode],
  );

  const waterfallSteps = useMemo(
    () =>
      activeDomain ? computeWaterfallSteps(activeDomain, selectedPeriod) : [],
    [activeDomain, selectedPeriod],
  );

  const trendData = useMemo(
    () =>
      activeDomain ? computeMonthlyTrendSeries(activeDomain, baseDomain) : null,
    [activeDomain, baseDomain],
  );

  const heatmap = useMemo(
    () =>
      activeDomain ? computeHeatmapMatrix(activeDomain, selectedPeriod) : null,
    [activeDomain, selectedPeriod],
  );

  const insights = useMemo(
    () =>
      activeDomain
        ? generateCostInsights({
            activeDomain,
            baseDomain,
            activeAudit,
            periodIdx: selectedPeriod,
            selectedDeptCode,
            isSimulationActive,
          })
        : [],
    [
      activeDomain,
      baseDomain,
      activeAudit,
      selectedPeriod,
      selectedDeptCode,
      isSimulationActive,
    ],
  );

  if (!activeDomain || !kpis || !trendData || !heatmap) {
    return null;
  }

  const currency = activeDomain.metadata.currency || 'PLN';
  const activeDeptMeta = selectedDeptCode
    ? activeDomain.allocation.departments.find((d) => d.code === selectedDeptCode) ??
      null
    : null;

  return (
    <div className="flex flex-col gap-4">
      {/* Pasek statusu filtra i szybkiego otwarcia symulatora */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--ink-secondary)]">
          <span>
            Analiza w oparciu o <strong className="text-white">HyperFormula</strong> ({activeDomain.allocation.departments.length} działów ·{' '}
            {activeDomain.allocation.categories.length} kategorii ·{' '}
            {activeDomain.products.length} produktów)
          </span>
          {activeDeptMeta ? (
            <button
              type="button"
              onClick={() => setSelectedDeptCode(null)}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-sky-400/55 bg-sky-500/15 px-2.5 py-0.5 text-xs font-medium text-sky-200 transition hover:bg-sky-500/25"
            >
              <span
                className="h-2 w-2 rounded-full"
                style={{ backgroundColor: activeDeptMeta.colorHex }}
              />
              Filtr: {activeDeptMeta.name}
              <FilterX className="h-3 w-3" />
            </button>
          ) : null}
        </div>

        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/45 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-sky-500/25"
        >
          <SlidersHorizontal className="h-3.5 w-3.5 text-sky-300" />
          Panel symulacji ({activeDomain.sliderControls.length})
        </button>
      </div>

      {/* 5 kart KPI */}
      <CostKpiStrip
        kpis={kpis}
        currency={currency}
        periodLabel={periodLabel}
        isAnnual={isAnnual}
        isSimulationActive={isSimulationActive}
      />

      {/* Rozkład wg działów & Kategorie kosztów (cross-filtered) */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="lg:col-span-6">
          <DepartmentBreakdown
            departments={deptBreakdown}
            currency={currency}
            periodLabel={periodLabel}
            selectedDeptCode={selectedDeptCode}
            isSimulationActive={isSimulationActive}
            onToggleDept={toggleDept}
            onClearFilter={() => setSelectedDeptCode(null)}
          />
        </div>
        <div className="lg:col-span-6">
          <CategoryBreakdown
            categories={categoryBreakdown}
            currency={currency}
            periodLabel={periodLabel}
            activeDept={
              activeDeptMeta
                ? {
                    code: activeDeptMeta.code,
                    name: activeDeptMeta.name,
                    colorHex: activeDeptMeta.colorHex,
                  }
                : null
            }
            isSimulationActive={isSimulationActive}
            onClearDept={() => setSelectedDeptCode(null)}
          />
        </div>
      </section>

      {/* Mostek wyniku (Waterfall) */}
      <WaterfallBridgeChart
        steps={waterfallSteps}
        currency={currency}
        periodLabel={periodLabel}
        periodSlug={periodSlug}
      />

      {/* Trend miesięczny kosztów wg działów vs przychody */}
      <CostTrendChart
        trend={trendData}
        currency={currency}
        selectedPeriod={selectedPeriod}
        selectedDeptCode={selectedDeptCode}
        isSimulationActive={isSimulationActive}
        onSelectPeriod={setSelectedPeriod}
      />

      {/* Deterministyczny Insights Engine */}
      <InsightsPanel insights={insights} periodLabel={periodLabel} />

      {/* Macierz cieplna Dział x Kategoria (TanStack Table) */}
      <AllocationHeatmapTable
        heatmap={heatmap}
        currency={currency}
        periodLabel={periodLabel}
        selectedDeptCode={selectedDeptCode}
        onToggleDept={toggleDept}
      />

      {/* Zwijana tabela miesięczna Dział x Okres (TanStack Table) */}
      <MonthlyDeptTable
        domain={activeDomain}
        selectedPeriod={selectedPeriod}
        selectedDeptCode={selectedDeptCode}
        onSelectPeriod={setSelectedPeriod}
        onToggleDept={toggleDept}
      />

      {/* Zwijana karta założeń i kluczy alokacji */}
      <AllocationKeysAccordion
        domain={activeDomain}
        onOpenSimulator={() => setDrawerOpen(true)}
      />
    </div>
  );
}
