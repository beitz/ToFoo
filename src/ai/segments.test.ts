import { describe, expect, it } from 'vitest';
import { appendText, PAUSE_MS, promptWithContext, rms, SEGMENT_MAX_MS, SEGMENT_TARGET_MS, shouldCut } from './segments';

describe('recording parts', () => {
  it('cuts at a pause once a part is long enough, and always at the maximum', () => {
    expect(shouldCut(SEGMENT_TARGET_MS - 1, PAUSE_MS * 10)).toBe(false);
    expect(shouldCut(SEGMENT_TARGET_MS, PAUSE_MS - 1)).toBe(false);
    expect(shouldCut(SEGMENT_TARGET_MS, PAUSE_MS)).toBe(true);
    expect(shouldCut(SEGMENT_MAX_MS, 0)).toBe(true);
  });

  it('measures the level of a signal', () => {
    expect(rms([])).toBe(0);
    expect(rms([0.5, -0.5, 0.5, -0.5])).toBeCloseTo(0.5);
  });

  it('gives the speech model the end of the text so far', () => {
    expect(promptWithContext('P', '')).toBe('P');
    expect(promptWithContext('P', 'abcdef', 3)).toBe('P\n\nThe recording so far ends with: def');
  });

  it('joins parts of one recording on the same line, new recordings on a new line', () => {
    expect(appendText('', 'b')).toBe('b');
    expect(appendText('a ', 'b', true)).toBe('a b');
    expect(appendText('a', 'b')).toBe('a\nb');
  });
});
