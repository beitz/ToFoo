import { describe, expect, it } from 'vitest';
import { addMonths, formatRange, monthEnd, monthGrid, presetOf, presetRange } from './periods';

const today = '2026-10-16';

describe('periods', () => {
  it('builds preset ranges that never reach past today', () => {
    expect(presetRange('day', '2026-10-15', today)).toEqual({ from: '2026-10-15', to: '2026-10-15' });
    expect(presetRange('week', today, today)).toEqual({ from: '2026-10-10', to: today });
    expect(presetRange('month', '2026-10-03', today)).toEqual({ from: '2026-10-01', to: today });
    expect(presetRange('month', '2026-02-10', today)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('recognises presets from a range', () => {
    expect(presetOf('2026-10-10', '2026-10-16', today)).toBe('week');
    expect(presetOf('2026-09-01', '2026-09-30', today)).toBe('month');
    expect(presetOf('2026-10-01', today, today)).toBe('month');
    expect(presetOf('2026-10-02', '2026-10-05', today)).toBe('range');
  });

  it('handles month arithmetic and labels', () => {
    expect(monthEnd('2028-02-03')).toBe('2028-02-29');
    expect(addMonths('2026-01', -1)).toBe('2025-12');
    expect(formatRange('2026-09-01', '2026-09-30', today)).toBe('September 2026');
    expect(formatRange('2026-10-10', today, today)).toBe('10.10. – 16.10.');
  });

  it('lays out a month Monday first', () => {
    const weeks = monthGrid('2026-10'); // 1 Oct 2026 is a Thursday
    expect(weeks[0]).toEqual([null, null, null, '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks.flat().filter(Boolean)).toHaveLength(31);
  });
});
