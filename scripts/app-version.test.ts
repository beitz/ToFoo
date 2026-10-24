import { describe, expect, it } from 'vitest';
import { buildInfo, releases, type Git } from './app-version';

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

describe('releases', () => {
  const log = ['c3\t2026-10-24T15:04:39+02:00\tJournal: private entries (#139)', 'c2\t2026-10-24T15:01:51+02:00\tSheets: focus frame (#138)', 'c1\t2026-10-15T06:11:00+02:00\tAdd files via upload'].join('\n');

  it('gives every squash-merged pull request its version and merge time', () => {
    const git = fakeGit({
      'rev-parse --is-shallow': 'false',
      'log --format=%H -G': 'base',
      'show base:package.json': '{"version": "0.1.0"}',
      'log --first-parent': log,
      'merge-base --is-ancestor base': '',
      'rev-list --count base..c3': '146',
      'rev-list --count base..c2': '145',
    });
    expect(releases(git)).toEqual({
      139: { version: '0.1.146', date: '2026-10-24T15:04:39+02:00' },
      138: { version: '0.1.145', date: '2026-10-24T15:01:51+02:00' },
    });
  });

  it('counts each pull request from the version line it was built with', () => {
    const git = fakeGit({
      'rev-parse --is-shallow': 'false',
      'log --format=%H -G': 'bump\nbase',
      'show bump:package.json': '{"version": "0.2.0"}',
      'show base:package.json': '{"version": "0.1.0"}',
      'log --first-parent': log,
      'merge-base --is-ancestor bump c3': '',
      'merge-base --is-ancestor base': '',
      'rev-list --count bump..c3': '1',
      'rev-list --count base..c2': '145',
    });
    expect(releases(git)).toEqual({
      139: { version: '0.2.1', date: '2026-10-24T15:04:39+02:00' },
      138: { version: '0.1.145', date: '2026-10-24T15:01:51+02:00' },
    });
  });

  it('is empty in a shallow clone', () => {
    expect(releases(fakeGit({ 'rev-parse --is-shallow': 'true' }))).toEqual({});
  });
});
