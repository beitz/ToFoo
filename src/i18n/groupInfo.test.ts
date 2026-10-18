import { describe, expect, it } from 'vitest';
import { NUTRIENTS } from '../model/nutrients';
import { nutrientType } from '../features/home/grouping';
import { INFO_GROUPS } from '../features/info/GroupInfo';
import { en } from './en';
import { GROUP_INFO_SOURCES } from './groupInfo.en';
import { EAA_IDS } from './nutrientInfo.en';
import { aminoAcidPattern } from '../../model/reference-values';

describe('nutrient group info pages', () => {
  it('has a title and sources for every group', () => {
    for (const g of INFO_GROUPS) {
      expect(en, g).toHaveProperty([`home.group.type.${g}`]);
      expect(GROUP_INFO_SOURCES[g]?.length, g).toBeGreaterThan(0);
    }
  });

  it('says where every vitamin and mineral comes from', () => {
    for (const n of NUTRIENTS.filter((x) => ['vitamins', 'minerals'].includes(nutrientType(x.id)))) expect(en, n.id).toHaveProperty([`ginfo.from.${n.id}`]);
  });

  it('explains every essential amino acid and has its WHO pattern value', () => {
    for (const id of EAA_IDS) {
      expect(en, id).toHaveProperty([`aaRole.${id}`]);
      expect(aminoAcidPattern.value[id], id).toBeGreaterThan(0);
    }
  });
});
