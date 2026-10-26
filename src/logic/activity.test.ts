import { describe, expect, it } from 'vitest';
import type { ActivityRecord } from '../storage/types';
import { activityKey, activitySun } from './activity';

const base = { schemaVersion: 1, day: '2026-10-15', time: new Date(2026, 9, 15, 7, 30).getTime(), minutes: 40 };

describe('activity', () => {
  it('counts outside activities toward the sun estimate unless already in the routine', () => {
    const acts: ActivityRecord[] = [
      { ...base, id: 'a', kind: 'walk', outside: true, sunSkin: 'faceHands' },
      { ...base, id: 'b', kind: 'walk', outside: true }, // part of the routine
      { ...base, id: 'c', kind: 'strength', outside: false },
    ];
    expect(activitySun(acts)).toEqual([{ day: '2026-10-15', startHour: 7.5, minutes: 40, skin: 'faceHands' }]);
  });

  it('counts the same kind, name in any case, row and place as one activity', () => {
    const walk = { kind: 'walk' as const, name: 'Commute ', outside: true };
    expect(activityKey(walk)).toBe(activityKey({ ...walk, name: 'commute' }));
    expect(activityKey(walk)).not.toBe(activityKey({ ...walk, outside: false }));
    expect(activityKey(walk)).not.toBe(activityKey({ ...walk, compendium: '17270' }));
  });
});
