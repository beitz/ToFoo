import { describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import { classifyError } from './client';

describe('classifyError', () => {
  const api = (status: number, message = 'x') => Anthropic.APIError.generate(status, { type: 'error', error: { type: 'invalid_request_error', message } }, message, new Headers());
  it('maps API failures to what the user can do about them', async () => {
    expect(await classifyError(api(401))).toBe('auth');
    expect(await classifyError(api(429))).toBe('rateLimit');
    expect(await classifyError(api(529))).toBe('overloaded');
    expect(await classifyError(new Anthropic.APIConnectionError({ message: 'offline' }))).toBe('network');
    expect(await classifyError(api(400, 'Web search is not enabled for this organization'))).toBe('webSearchOff');
    expect(await classifyError(api(400))).toBe('other');
    expect(await classifyError(new Error('bug'))).toBe('other');
  });
});
