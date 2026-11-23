import type { ResolvedSliderControl } from '@/types/contract';

const MINUS = '\u2212';

const MONTHS_SHORT_PL = [
  'sty',
  'lut',
  'mar',
  'kwi',
  'maj',
  'cze',
  'lip',
  'sie',
  'wrz',
  'paź',
  'lis',
  'gru',
] as const;

const MONTHS_LONG_PL = [
  'Styczeń',
  'Luty',
  'Marzec',
  'Kwiecień',
  'Maj',
  'Czerwiec',
  'Lipiec',
  'Sierpień',
  'Wrzesień',
  'Październik',
  'Listopad',
  'Grudzień',
] as const;

function signPrefix(value: number, explicitPlus = false): string {
  if (value < 0) return MINUS;
  if (explicitPlus && value > 0) return '+';
  return '';
}

export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '–';
  const roundedZero = Math.abs(value) < Math.pow(10, -(decimals + 1));
  const safeVal = roundedZero ? 0 : value;
  const absFormatted = Math.abs(safeVal).toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${safeVal < 0 ? MINUS : ''}${absFormatted}`;
}

export function formatMoneyCompact(value: number, currency?: string): string {
  if (!Number.isFinite(value)) return '–';
  const abs = Math.abs(value);
  const sign = value < 0 && abs >= 0.5 ? MINUS : '';
  const unitSuffix = currency ? ` ${currency}` : '';

  if (abs >= 1_000_000) {
    const formatted = (abs / 1_000_000).toLocaleString('pl-PL', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${sign}${formatted} mln${unitSuffix}`;
  }
  if (abs >= 1_000) {
    const decimals = abs >= 100_000 ? 0 : 1;
    const formatted = (abs / 1_000).toLocaleString('pl-PL', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    return `${sign}${formatted} tys.${unitSuffix}`;
  }
  const formatted = Math.round(abs).toLocaleString('pl-PL', {
    maximumFractionDigits: 0,
  });
  return `${sign}${formatted}${unitSuffix}`;
}

export function formatMoneyFull(value: number, currency = 'PLN'): string {
  if (!Number.isFinite(value)) return '–';
  const rounded = Math.round(value);
  if (rounded === 0) return `0 ${currency}`;
  const sign = rounded < 0 ? MINUS : '';
  const absFormatted = Math.abs(rounded).toLocaleString('pl-PL', {
    maximumFractionDigits: 0,
  });
  return `${sign}${absFormatted} ${currency}`;
}

export function formatThousands(value: number): string {
  if (!Number.isFinite(value)) return '–';
  const rounded = Math.round(value / 1000);
  if (rounded === 0) return '–';
  const sign = rounded < 0 ? MINUS : '';
  return `${sign}${Math.abs(rounded).toLocaleString('pl-PL', { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return '–';
  const pct = value * 100;
  const roundedZero = Math.abs(pct) < Math.pow(10, -(decimals + 1));
  const safePct = roundedZero ? 0 : pct;
  const sign = safePct < 0 ? MINUS : '';
  return `${sign}${Math.abs(safePct).toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatSignedPercent(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return '–';
  const pct = value * 100;
  const roundedZero = Math.abs(pct) < Math.pow(10, -(decimals + 1));
  if (roundedZero) return decimals > 0 ? `${(0).toLocaleString('pl-PL', { minimumFractionDigits: decimals })}%` : '0%';
  const prefix = signPrefix(pct, true);
  return `${prefix}${Math.abs(pct).toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}%`;
}

export function formatPpDelta(delta: number, decimals = 1): string {
  if (!Number.isFinite(delta)) return '–';
  const pp = delta * 100;
  const roundedZero = Math.abs(pp) < Math.pow(10, -(decimals + 1));
  if (roundedZero) return `${(0).toLocaleString('pl-PL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} pp`;
  return `${signPrefix(pp, true)}${Math.abs(pp).toLocaleString('pl-PL', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })} pp`;
}

export function formatRatio(value: number, decimals = 2, suffix = 'x'): string {
  if (!Number.isFinite(value)) return '–';
  return `${formatNumber(value, decimals)}${suffix}`;
}

export function formatPeriodShort(isoOrLabel: string, multiYear = false): string {
  const m = /^(\d{4})-(\d{2})$/.exec(isoOrLabel.trim());
  if (m) {
    const year = m[1];
    const monthIdx = Number(m[2]) - 1;
    const base = MONTHS_SHORT_PL[monthIdx] ?? isoOrLabel;
    return multiYear ? `${base} '${year.slice(2)}` : base;
  }
  return isoOrLabel;
}

export function formatPeriodLong(isoOrLabel: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(isoOrLabel.trim());
  if (m) {
    const year = m[1];
    const monthIdx = Number(m[2]) - 1;
    const monthName = MONTHS_LONG_PL[monthIdx];
    if (monthName) return `${monthName} ${year}`;
  }
  return isoOrLabel;
}

export function formatSliderValue(
  control: ResolvedSliderControl,
  value: number,
  normalizedShare?: number,
): string {
  switch (control.format) {
    case 'percent_signed':
      return formatSignedPercent(value, Math.abs(control.step) < 0.01 ? 1 : 0);
    case 'percent':
      return formatPercent(value, 1);
    case 'integer_os':
      return `${Math.round(value)} ${control.unit || 'os.'}`;
    case 'weight_share':
      if (normalizedShare !== undefined) {
        return `${formatPercent(normalizedShare, 0)} (${Math.round(value)})`;
      }
      return `${Math.round(value)} ${control.unit || 'pkt'}`;
    case 'currency':
      return formatMoneyFull(value);
    default:
      return `${formatNumber(value, Math.abs(control.step) < 1 ? 2 : 0)}${control.unit ? ` ${control.unit}` : ''}`;
  }
}
