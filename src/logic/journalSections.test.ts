import { describe, expect, it } from 'vitest';
import { journalSections } from './journalSections';

const e = (day: string, hour: number) => ({ day, time: Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00Z`) });

describe('journalSections', () => {
  it('groups by day and month, newest first, and folds earlier years', () => {
    const entries = [e('2026-10-22', 9), e('2026-10-22', 7), e('2026-10-21', 8), e('2026-09-30', 8), e('2025-12-31', 8), e('2025-11-02', 8), e('2024-01-05', 8)];
    const { months, years } = journalSections(entries, '2026-10-23');
    expect(months.map((m) => [m.month, m.count])).toEqual([
      ['2026-10', 3],
      ['2026-09', 1],
    ]);
    expect(months[0]!.days.map((d) => d.day)).toEqual(['2026-10-22', '2026-10-21']);
    // Within a day, as written.
    expect(months[0]!.days[0]!.entries.map((x) => x.time)).toEqual([e('2026-10-22', 7).time, e('2026-10-22', 9).time]);
    expect(years.map((y) => [y.year, y.count, y.months.map((m) => m.month)])).toEqual([
      ['2025', 2, ['2025-12', '2025-11']],
      ['2024', 1, ['2024-01']],
    ]);
  });

  it('has nothing for an empty journal', () => {
    expect(journalSections([], '2026-10-23')).toEqual({ months: [], years: [] });
  });
});
