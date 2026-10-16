import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { classifyError } from './client';

describe('classifyError', () => {
  const api = (status: number) => Anthropic.APIError.generate(status, { type: 'error', error: { type: 'x', message: 'x' } }, 'x', new Headers());
  it('maps API failures to what the user can do about them', async () => {
    expect(await classifyError(api(401))).toBe('auth');
    expect(await classifyError(api(429))).toBe('rateLimit');
    expect(await classifyError(api(529))).toBe('overloaded');
    expect(await classifyError(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe('network');
    expect(await classifyError(new Error('bug'))).toBe('other');
  });
});
