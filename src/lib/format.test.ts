import { describe, expect, it } from 'vitest';
import { fmtAmount, fmtBytes, fmtFill, fmtPercent, fmtTokens, fmtUsd } from './format';

describe('format', () => {
  it('shows large µg amounts in mg', () => {
    expect(fmtAmount('MN', 4934)).toBe('4.9 mg');
    expect(fmtAmount('VITB6', 98)).toBe('98 µg');
    expect(fmtAmount('VITB12', 2.4)).toBe('2.4 µg');
  });
  it('formats percentages', () => {
    expect(fmtPercent(0.456)).toBe('46%');
  });
  it('never shows a store with something in it as 0% full', () => {
    expect(fmtFill(0.001)).toBe('<1%');
    expect(fmtFill(0)).toBe('0%');
    expect(fmtFill(0.6)).toBe('60%');
  });
  it('formats small dollar amounts and token counts', () => {
    expect(fmtUsd(0.0312)).toBe('$0.031');
    expect(fmtUsd(0.0004)).toBe('<$0.001');
    expect(fmtUsd(0)).toBe('$0.000');
    expect(fmtUsd(12.5)).toBe('$12.50');
    expect(fmtTokens(950)).toBe('950');
    expect(fmtBytes(300)).toBe('1 kB');
    expect(fmtBytes(820_400)).toBe('820 kB');
    expect(fmtBytes(4_230_000)).toBe('4.2 MB');
    expect(fmtTokens(23_456)).toBe('23.5k');
    expect(fmtTokens(1_250_000)).toBe('1.25M');
  });
});
