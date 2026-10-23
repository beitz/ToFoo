import { describe, expect, it } from 'vitest';
import { viewsOf } from './views';

describe('viewsOf', () => {
  it('defaults to rings for energy and macros, bars for nutrients', () => {
    expect(viewsOf({})).toEqual({ macros: 'rings', nutrients: 'bars' });
  });
  it('lets each setting differ', () => {
    expect(viewsOf({ macroView: 'bars' })).toEqual({ macros: 'bars', nutrients: 'bars' });
    expect(viewsOf({ nutrientView: 'comets' })).toEqual({ macros: 'rings', nutrients: 'comets' });
  });
});
