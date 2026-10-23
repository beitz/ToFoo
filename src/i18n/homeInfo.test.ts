import { describe, expect, it } from 'vitest';
import { t } from '.';
import { STORE_SOURCE_LABELS, storeSources, storeSourceUrls, todaySources, weekSources } from './homeInfo.en';

describe('sources under the Home ⓘ texts', () => {
  it('links a source for the size of every body store', () => {
    const stores = storeSourceUrls();
    expect(stores.length).toBeGreaterThan(0);
    for (const [id, url] of stores) {
      expect(url, id).toBeTruthy();
      expect(STORE_SOURCE_LABELS, id).toHaveProperty([url!]);
    }
    const listed = storeSources(t).map((s) => s.about ?? '').join(' ');
    expect(listed).toContain('Iron');
    expect(listed).toContain('Vitamin D');
  });

  it('gives every card at least one https source', () => {
    for (const list of [todaySources(t), weekSources(t), storeSources(t)]) {
      expect(list.length).toBeGreaterThan(0);
      for (const s of list) expect(s.url).toMatch(/^https:\/\//);
    }
  });
});
