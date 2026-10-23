import { describe, expect, it } from 'vitest';
import { DEFAULT_FEATURES, FEATURE_GROUPS, FEATURES, isOn } from './features';

describe('features', () => {
  it('keeps fasting on for settings saved before it could be turned off, and off for new installs', () => {
    expect(isOn({}, 'fasting')).toBe(true);
    expect(isOn(DEFAULT_FEATURES, 'fasting')).toBe(false);
    expect(isOn({ fasting: true }, 'fasting')).toBe(true);
  });

  it('puts every feature in a section, and a needed feature before the ones that need it', () => {
    for (const f of FEATURES) {
      expect(FEATURE_GROUPS).toContain(f.group);
      if (!f.requires) continue;
      const parent = FEATURES.findIndex((p) => p.key === f.requires);
      expect(parent).toBeGreaterThanOrEqual(0);
      expect(parent).toBeLessThan(FEATURES.indexOf(f));
    }
  });
});
