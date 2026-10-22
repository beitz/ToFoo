import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatDay, formatTime } from './dates';

describe('German date formats', () => {
  const today = '2026-10-22';
  it('writes dates as day.month.year', () => {
    expect(formatDate('2026-03-05')).toBe('05.03.2026');
    expect(formatDate('2026-03-05', false)).toBe('05.03.');
  });

  it('names recent days and adds the year only for other years', () => {
    expect(formatDay(today, today)).toBe('Today');
    expect(formatDay('2026-10-21', today)).toBe('Yesterday');
    expect(formatDay('2026-10-19', today)).toBe('Mon 19.10.');
    expect(formatDay('2025-12-31', today)).toBe('Wed 31.12.2025');
  });

  it('uses the 24-hour clock', () => {
    const t = new Date(2026, 9, 22, 13, 5).getTime();
    expect(formatTime(t)).toBe('13:05');
    expect(formatTime(new Date(2026, 9, 22, 0, 30).getTime())).toBe('00:30');
    expect(formatDateTime(t, today)).toBe('Thu 22.10., 13:05');
  });
});
