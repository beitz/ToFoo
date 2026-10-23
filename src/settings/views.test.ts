import { describe, expect, it } from 'vitest';
import { viewsOf } from './views';

describe('viewsOf', () => {
  it('defaults to rings and comets', () => {
    expect(viewsOf({})).toEqual({ macros: 'rings', nutrients: 'comets' });
  });
  it('carries over the earlier "Lists" layout as bars for both', () => {
    expect(viewsOf({ homeView: 'compact' })).toEqual({ macros: 'bars', nutrients: 'bars' });
  });
  it('lets each setting differ', () => {
    expect(viewsOf({ homeView: 'compact', macroView: 'rings' })).toEqual({ macros: 'rings', nutrients: 'bars' });
    expect(viewsOf({ nutrientView: 'bars' })).toEqual({ macros: 'rings', nutrients: 'bars' });
  });
});
