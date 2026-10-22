import { describe, expect, it } from 'vitest';
import { setAsk, takeAsk } from './ask';

describe('ask', () => {
  it('hands the question over once', () => {
    expect(takeAsk()).toBeNull();
    setAsk('How am I doing?');
    expect(takeAsk()).toBe('How am I doing?');
    expect(takeAsk()).toBeNull();
  });
});
