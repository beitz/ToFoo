import { describe, expect, it } from 'vitest';
import { cardSpan, stripRange, type Card } from './cards';

const H = 3_600_000;

describe('cardSpan', () => {
  it('uses the card time, the fallback without one, and spans for sleep and activity', () => {
    expect(cardSpan({ kind: 'meal', proposal: { id: 'M1', time: 5 * H } as never, logged: false }, 0)).toEqual({ start: 5 * H, end: 5 * H });
    expect(cardSpan({ kind: 'note', note: { id: 'J1', text: 'x' } as never, logged: false }, 7)).toEqual({ start: 7, end: 7 });
    expect(cardSpan({ kind: 'sleep', sleep: { id: 'S1', start: 0, end: 8 * H } as never, logged: false }, 0)).toEqual({ start: 0, end: 8 * H });
    expect(cardSpan({ kind: 'activity', activity: { id: 'A1', start: H, minutes: 45 } as never, logged: false }, 0)).toEqual({ start: H, end: H + 45 * 60_000 });
    expect(cardSpan({ kind: 'shopping', shopping: { id: 'L1' } as never, logged: false } as Card, 0)).toBeUndefined();
  });
});

describe('stripRange', () => {
  it('pads by a tenth of the range, at least half an hour', () => {
    expect(stripRange([{ start: 0, end: 10 * H }])).toEqual({ from: -H, to: 11 * H });
    expect(stripRange([{ start: H, end: H }])).toEqual({ from: H / 2, to: 1.5 * H });
    expect(stripRange([])).toBeUndefined();
  });
});
