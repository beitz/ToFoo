import { describe, expect, it } from 'vitest';
import { viewsOf } from './views';

describe('viewsOf', () => {
  it('defaults to bars for both', () => {
    expect(viewsOf({})).toEqual({ macros: 'bars', nutrients: 'bars' });
  });
  it('lets each setting differ', () => {
    expect(viewsOf({ macroView: 'rings' })).toEqual({ macros: 'rings', nutrients: 'bars' });
    expect(viewsOf({ nutrientView: 'comets' })).toEqual({ macros: 'bars', nutrients: 'comets' });
  });
});
