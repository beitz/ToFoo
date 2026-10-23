import { describe, expect, it } from 'vitest';
import { buildInfo, type Git } from './app-version';

const now = new Date('2026-10-23T12:00:00Z');

/** A fake git: answers by the start of the command. */
const fakeGit =
  (answers: Record<string, string | null>): Git =>
  (args) => {
    const key = Object.keys(answers).find((k) => args.startsWith(k));
    return key === undefined ? null : (answers[key] ?? null);
  };

describe('buildInfo', () => {
  it('takes major and minor from package.json and counts commits since the version line last changed', () => {
    const git = fakeGit({ 'rev-parse --short': 'e9fec8f', 'rev-parse --is-shallow': 'false', 'log -1': 'abc123', 'rev-list --count abc123..HEAD': '140' });
    expect(buildInfo('0.1.0', git, now)).toEqual({ version: '0.1.140', commit: 'e9fec8f', builtAt: '2026-10-23T12:00:00.000Z' });
  });

  it('ignores the patch number written in package.json', () => {
    const git = fakeGit({ 'rev-parse --short': 'e9fec8f', 'rev-parse --is-shallow': 'false', 'log -1': 'abc', 'rev-list': '3' });
    expect(buildInfo('0.2.7', git, now).version).toBe('0.2.3');
  });

  it('says dev instead of a wrong number in a shallow clone or without git', () => {
    const shallow = fakeGit({ 'rev-parse --short': 'e9fec8f', 'rev-parse --is-shallow': 'true', 'log -1': 'abc', 'rev-list': '1' });
    expect(buildInfo('0.1.0', shallow, now).version).toBe('0.1.dev');
    expect(buildInfo('0.1.0', fakeGit({}), now)).toEqual({ version: '0.1.dev', commit: '', builtAt: '2026-10-23T12:00:00.000Z' });
  });
});
