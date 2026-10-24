import { describe, expect, it } from 'vitest';
import { en } from '../../i18n/en';
import { byDay, changeList } from './versionHistory';

const releases = {
  97: { version: '0.1.125', date: '2026-10-23T09:47:01+02:00' },
  98: { version: '0.1.104', date: '2026-10-23T03:33:00+02:00' },
  137: { version: '0.1.144', date: '2026-10-24T14:50:37+02:00' },
  139: { version: '0.1.146', date: '2026-10-24T15:04:39+02:00' },
};

describe('version history', () => {
  it('lists changes in merge order, with the not yet merged ones first', () => {
    const keys = ['change.98', 'change.98.major', 'change.97', 'change.139', 'change.137', 'change.200', 'about.title'];
    expect(changeList(keys, releases).map((c) => c.pr)).toEqual([200, 139, 137, 97, 98]);
  });

  it('groups by day with the day’s version range, and drops days with nothing kept', () => {
    const days = byDay(changeList(['change.98', 'change.97', 'change.139', 'change.137', 'change.200'], releases), (c) => c.pr !== 97 && c.pr !== 98);
    expect(days.map((d) => [d.day, d.first, d.last, d.changes.map((c) => c.pr)])).toEqual([
      [null, undefined, undefined, [200]],
      ['2026-10-24', '0.1.144', '0.1.146', [139, 137]],
    ]);
  });

  it('has a line for every change, and a highlight only next to a line', () => {
    const keys = Object.keys(en);
    const prs = new Set(changeList(keys, {}).map((c) => c.pr));
    expect(prs.size).toBeGreaterThan(50);
    for (const k of keys.filter((k) => k.startsWith('change.'))) {
      const m = /^change\.(\d+)(\.major)?$/.exec(k);
      expect(m, k).toBeTruthy();
      expect(prs.has(Number(m![1])), k).toBe(true);
    }
  });
});
