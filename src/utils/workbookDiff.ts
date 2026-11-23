import type { FinancialDomainModel } from '@/types/financial';
import { formatMoneyFull, formatNumber, formatPercent } from './formatters';

export interface WorkbookChangeItem {
  label: string;
  before: string;
  after: string;
}

function approxDiff(a: number, b: number, eps = 1e-6): boolean {
  return Math.abs(a - b) > eps;
}

export function diffDomainModels(
  prev: FinancialDomainModel | null,
  next: FinancialDomainModel,
): WorkbookChangeItem[] {
  if (!prev) return [];
  const changes: WorkbookChangeItem[] = [];
  const cur = next.metadata.currency;

  // 1. Parametry globalne
  const cfgSpecs: Array<{
    label: string;
    a: number;
    b: number;
    fmt: (v: number) => string;
  }> = [
    {
      label: 'Stawka CIT',
      a: prev.config.citRate,
      b: next.config.citRate,
      fmt: (v) => formatPercent(v, 1),
    },
    {
      label: 'Limit overdraftu',
      a: prev.config.overdraftLimit,
      b: next.config.overdraftLimit,
      fmt: (v) => formatMoneyFull(v, cur),
    },
    {
      label: 'Minimalna gotówka',
      a: prev.config.minCash,
      b: next.config.minCash,
      fmt: (v) => formatMoneyFull(v, cur),
    },
    {
      label: 'Udział Q4 w sprzedaży',
      a: prev.config.q4Share,
      b: next.config.q4Share,
      fmt: (v) => formatPercent(v, 1),
    },
    {
      label: 'Udział sprzedaży online',
      a: prev.config.onlineShare,
      b: next.config.onlineShare,
      fmt: (v) => formatPercent(v, 1),
    },
    {
      label: 'Zużycie surowca',
      a: prev.config.rawUsageFactor,
      b: next.config.rawUsageFactor,
      fmt: (v) => formatNumber(v, 2),
    },
  ];
  for (const s of cfgSpecs) {
    if (approxDiff(s.a, s.b)) {
      changes.push({ label: s.label, before: s.fmt(s.a), after: s.fmt(s.b) });
    }
  }

  // 2. Produkty
  const prevProds = new Map(prev.products.map((p) => [p.code, p]));
  const nextProds = new Map(next.products.map((p) => [p.code, p]));
  for (const [code, np] of nextProds.entries()) {
    const pp = prevProds.get(code);
    if (!pp) {
      changes.push({ label: `Nowy produkt: ${np.name}`, before: '—', after: `${formatNumber(np.annualVolume)} ${np.unit}` });
      continue;
    }
    if (approxDiff(pp.annualVolume, np.annualVolume, 0.01)) {
      changes.push({
        label: `${np.name} (wolumen)`,
        before: `${formatNumber(pp.annualVolume)} ${pp.unit}`,
        after: `${formatNumber(np.annualVolume)} ${np.unit}`,
      });
    }
    if (approxDiff(pp.netPrice, np.netPrice, 0.001)) {
      changes.push({
        label: `${np.name} (cena)`,
        before: `${formatNumber(pp.netPrice, 2)} ${cur}`,
        after: `${formatNumber(np.netPrice, 2)} ${cur}`,
      });
    }
    if (pp.active !== np.active) {
      changes.push({
        label: `${np.name} (status)`,
        before: pp.active ? 'aktywny' : 'wyłączony',
        after: np.active ? 'aktywny' : 'wyłączony',
      });
    }
  }
  for (const [code, pp] of prevProds.entries()) {
    if (!nextProds.has(code)) {
      changes.push({ label: `Usunięty produkt: ${pp.name}`, before: 'aktywny', after: '—' });
    }
  }

  // 3. Działy (obsada i wagi najmu)
  const prevDepts = new Map(prev.allocation.departments.map((d) => [d.code, d]));
  const nextDepts = new Map(next.allocation.departments.map((d) => [d.code, d]));
  for (const [code, nd] of nextDepts.entries()) {
    const pd = prevDepts.get(code);
    if (!pd) {
      changes.push({ label: `Nowy dział: ${nd.name}`, before: '—', after: `${nd.headcount} os.` });
      continue;
    }
    if (approxDiff(pd.headcount, nd.headcount)) {
      changes.push({
        label: `Obsada: ${nd.name}`,
        before: `${pd.headcount} os.`,
        after: `${nd.headcount} os.`,
      });
    }
    if (approxDiff(pd.rentWeight, nd.rentWeight)) {
      changes.push({
        label: `Waga najmu: ${nd.name}`,
        before: formatNumber(pd.rentWeight, 0),
        after: formatNumber(nd.rentWeight, 0),
      });
    }
  }
  for (const [code, pd] of prevDepts.entries()) {
    if (!nextDepts.has(code)) {
      changes.push({ label: `Usunięty dział: ${pd.name}`, before: `${pd.headcount} os.`, after: '—' });
    }
  }

  // 4. Bezpośrednie wagi macierzy alokacji
  const prevMat = new Map(prev.allocation.matrix.map((m) => [m.lineCode, m]));
  for (const nm of next.allocation.matrix) {
    const pm = prevMat.get(nm.lineCode);
    if (!pm) continue;
    const isAutoKey = nm.allocRule.toLowerCase().includes('klucz');
    if (isAutoKey) continue;
    for (const dept of next.allocation.departments) {
      const wBefore = pm.weights[dept.code] ?? 0;
      const wAfter = nm.weights[dept.code] ?? 0;
      if (approxDiff(wBefore, wAfter, 1e-4)) {
        changes.push({
          label: `Macierz: ${nm.lineName} → ${dept.name}`,
          before: formatPercent(wBefore, 1),
          after: formatPercent(wAfter, 1),
        });
      }
    }
  }

  // 5. Moment zero w Bilansie
  for (const nr of next.bs.rows) {
    if (nr.rowType !== 'DETAIL' || nr.zeroValue === null) continue;
    const pr = prev.bs.byCode[nr.lineCode];
    if (!pr || pr.zeroValue === null) continue;
    if (approxDiff(pr.zeroValue, nr.zeroValue, 0.5)) {
      changes.push({
        label: `Moment zero: ${nr.label}`,
        before: formatMoneyFull(pr.zeroValue, cur),
        after: formatMoneyFull(nr.zeroValue, cur),
      });
    }
  }

  return changes;
}
