import fs from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createFinancialEngineSession } from '@/engine/formulaEngine';
import type { ResolvedSliderControl } from '@/types/contract';
import {
  formatMoneyCompact,
  formatMoneyFull,
  formatPeriodLong,
  formatPeriodShort,
  formatPpDelta,
  formatRatio,
  formatSignedPercent,
  formatSliderValue,
  formatThousands,
} from '@/utils/formatters';
import { diffDomainModels } from '@/utils/workbookDiff';

describe('formatters (pl-PL)', () => {
  it('formatuje kwoty kompaktowe, pełne i tysiące z właściwym znakiem minusa', () => {
    expect(formatMoneyCompact(9_000_000, 'PLN')).toBe('9,00 mln PLN');
    expect(formatMoneyCompact(-1_337_692.34)).toBe('−1,34 mln');
    expect(formatMoneyCompact(819_113)).toBe('819 tys.');
    expect(formatMoneyCompact(1_905)).toBe('1,9 tys.');
    expect(formatMoneyCompact(-540, 'PLN')).toBe('−540 PLN');

    expect(formatMoneyFull(-41_678.49, 'PLN')).toBe('−41\u00a0678 PLN');
    expect(formatThousands(1_208_095)).toBe('1208');
    expect(formatThousands(12_080_095)).toBe('12\u00a0080');
    expect(formatThousands(120)).toBe('–');
  });

  it('formatuje procenty, delty pp, wskaźniki i okresy ISO', () => {
    expect(formatSignedPercent(0.25, 0)).toBe('+25%');
    expect(formatSignedPercent(-0.15, 0)).toBe('−15%');
    expect(formatSignedPercent(0, 0)).toBe('0%');
    expect(formatPpDelta(0.0234, 1)).toBe('+2,3 pp');
    expect(formatPpDelta(-0.015, 1)).toBe('−1,5 pp');
    expect(formatRatio(1.456, 2)).toBe('1,46x');

    expect(formatPeriodShort('2027-10', false)).toBe('paź');
    expect(formatPeriodShort('2028-01', true)).toBe("sty '28");
    expect(formatPeriodLong('2027-10')).toBe('Październik 2027');
  });

  it('formatuje wartości suwaków zgodnie z formatem kontraktu', () => {
    const baseCtrl: ResolvedSliderControl = {
      controlKey: 'vol',
      sliderId: 'vol',
      group: 'Rynek',
      label: 'Wolumen',
      targetRef: 'SIM_VOL_DELTA',
      mode: 'DELTA_PCT',
      format: 'percent_signed',
      min: -0.3,
      max: 0.3,
      step: 0.01,
      quickBar: true,
      sortOrder: 10,
      unit: '%',
      tooltip: '',
      cell: { sheet: '01_Zalozenia_Modelu', row: 0, col: 0 },
      baseValue: 0,
    };
    expect(formatSliderValue(baseCtrl, -0.1)).toBe('−10%');

    const hcCtrl: ResolvedSliderControl = {
      ...baseCtrl,
      controlKey: 'hc_auto:PROD',
      mode: 'TABLE_COLUMN_ABS',
      format: 'integer_os',
      unit: 'os.',
    };
    expect(formatSliderValue(hcCtrl, 14)).toBe('14 os.');

    const rnCtrl: ResolvedSliderControl = {
      ...baseCtrl,
      controlKey: 'rn_auto:PROD',
      mode: 'TABLE_COLUMN_ABS',
      format: 'weight_share',
      unit: 'pkt',
    };
    expect(formatSliderValue(rnCtrl, 55, 0.55)).toBe('55% (55)');
  });
});

describe('diffDomainModels', () => {
  it('wykrywa zmiany parametrów globalnych, produktów, obsady i Momentu Zero', async () => {
    const buf = await fs.readFile(
      path.resolve(process.cwd(), 'public/templates/Budzet_BETA_v2_Standard.xlsx'),
    );
    const s = await createFinancialEngineSession(buf, 'BETA.xlsx');
    try {
      const prev = s.baseDomain!;
      const next = structuredClone(prev);
      next.config.citRate = 0.2;
      next.products[0].netPrice = 95;
      next.allocation.departments[0].headcount = 16;
      next.bs.rows.find((r) => r.lineCode === 'BS_CASH')!.zeroValue = 600_000;

      const diffs = diffDomainModels(prev, next);
      expect(diffs.some((d) => d.label === 'Stawka CIT')).toBe(true);
      expect(diffs.some((d) => d.label === 'Produkt X (cena)')).toBe(true);
      expect(diffs.some((d) => d.label === 'Obsada: Produkcja')).toBe(true);
      expect(diffs.some((d) => d.label.startsWith('Moment zero:'))).toBe(true);
    } finally {
      s.destroy();
    }
  });
});
