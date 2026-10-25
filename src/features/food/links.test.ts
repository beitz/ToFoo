import { describe, expect, it } from 'vitest';
import type { AppData } from '../../app/data';
import type { Product } from '../../storage/types';
import { refOfCode } from './links';

const d = {
  foods: { version: '4.0', byCode: new Map([['C131000', {}]]) },
  productsById: new Map([['OFF:4001', { id: 'OFF:4001', source: 'OFF', code: '4001' } as Product]]),
} as unknown as Pick<AppData, 'foods' | 'productsById'>;

describe('refOfCode', () => {
  it('gives the stored reference for a BLS code or a saved product', () => {
    expect(refOfCode(d, 'C131000')).toEqual({ source: 'BLS', version: '4.0', code: 'C131000' });
    expect(refOfCode(d, 'OFF:4001')).toEqual({ source: 'OFF', code: '4001' });
  });
  it('gives nothing for an unknown food or none', () => {
    expect(refOfCode(d, 'X999999')).toBeUndefined();
    expect(refOfCode(d, 'OFF:9')).toBeUndefined();
    expect(refOfCode(d, undefined)).toBeUndefined();
  });
});
