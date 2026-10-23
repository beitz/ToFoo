import { describe, expect, it } from 'vitest';
import { t, type MessageKey } from '../src/i18n';
import { MODEL_NUTRIENT_IDS } from '../src/model/nutrients';
import { logTrust, trustReasons } from './log-trust';

describe('log trust marks', () => {
  it('gives every tracked nutrient a mark with a cited reason and a sentence', () => {
    for (const id of MODEL_NUTRIENT_IDS) {
      const mark = logTrust[id];
      expect(mark, id).toBeDefined();
      expect(trustReasons[mark!.reason].source.length).toBeGreaterThan(0);
      const key = `trust.reason.${mark!.reason}` as MessageKey;
      expect(t(key)).not.toBe(key);
    }
  });
});
