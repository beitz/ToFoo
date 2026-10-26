import { describe, expect, it } from 'vitest';
import { activityKcal, defaultRow, effortOfMet, extraKcal } from './activityEnergy';

describe('activity energy', () => {
  it('converts MET × kg × time with the Compendium formula (MET × 3.5 × kg / 200 per minute)', () => {
    expect(activityKcal(4.8, 80, 60)).toBeCloseTo((4.8 * 3.5 * 80 * 60) / 200);
  });

  it('adds only what the activity costs above the base day for its minutes, never less than nothing', () => {
    // 2,400 kcal a day is 100 kcal an hour.
    expect(extraKcal(4.8, 80, 60, 2400)).toBeCloseTo(activityKcal(4.8, 80, 60) - 100);
    expect(extraKcal(1, 80, 60, 2400)).toBe(0);
  });

  it('reads the effort from absolute intensity bands', () => {
    expect(effortOfMet(2.9)).toBe('easy');
    expect(effortOfMet(3)).toBe('moderate');
    expect(effortOfMet(5.9)).toBe('moderate');
    expect(effortOfMet(6)).toBe('hard');
  });

  it('picks a row per kind and effort, moderate when no effort was given, none for other', () => {
    expect(defaultRow('walk', 'hard')).toBe('17200');
    expect(defaultRow('walk', undefined)).toBe(defaultRow('walk', 'moderate'));
    expect(defaultRow('other', 'hard')).toBeUndefined();
  });
});
