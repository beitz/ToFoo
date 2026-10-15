import { describe, expect, it } from 'vitest';
import { fmtAmount, fmtPercent } from './format';

describe('format', () => {
  it('shows large µg amounts in mg', () => {
    expect(fmtAmount('MN', 4934)).toBe('4.9 mg');
    expect(fmtAmount('VITB6', 98)).toBe('98 µg');
    expect(fmtAmount('VITB12', 2.4)).toBe('2.4 µg');
  });
  it('formats percentages', () => {
    expect(fmtPercent(0.456)).toBe('46%');
  });
});
