import { describe, expect, it } from 'vitest';
import { NUTRIENTS } from '../model/nutrients';
import { en } from './en';
import { infoId, NUTRIENT_INFO_SOURCES } from './nutrientInfo.en';

describe('nutrient explanations', () => {
  it('has a role, too little, too much and a source for every nutrient', () => {
    for (const n of NUTRIENTS) {
      const key = infoId(n.id);
      for (const part of ['role', 'low', 'high']) expect(en, `${n.id} ${part}`).toHaveProperty([`info.${key}.${part}`]);
      expect(NUTRIENT_INFO_SOURCES[key], n.id).toBeDefined();
    }
  });
});
