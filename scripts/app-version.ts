import { execSync } from 'node:child_process';

/** What the build stamps into the app and into `version.json` next to it. */
export interface BuildInfo {
  /** `0.1.146`: major and minor from package.json, the last number counted from git (below). */
  version: string;
  /** Short commit hash, '' outside a git checkout. */
  commit: string;
  /** ISO time of the build. */
  builtAt: string;
}

/** Runs `git <args>` and returns its trimmed output, or null when git fails. */
export type Git = (args: string) => string | null;

export const runGit: Git = (args) => {
  try {
    return execSync(`git ${args}`, { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
};

/**
 * The app's version (owner's ask 2026-10-23: "I'm not sure when an update is live"). Major and minor
 * are set by hand in package.json (0.x while in early development; bump the minor at a milestone).
 * The last number counts the commits on top of the commit that last changed package.json's version,
 * so it goes up by one with every pull request merged into main (they are squashed) and restarts at
 * 0 after a minor bump; nobody has to remember to bump it, and parallel pull requests can't clash.
 * Without the git history (a shallow clone counts wrong) it says "dev" instead of a wrong number.
 */
export function buildInfo(pkgVersion: string, git: Git, now: Date): BuildInfo {
  const [major = '0', minor = '0'] = pkgVersion.split('.');
  const commit = git('rev-parse --short HEAD') ?? '';
  const shallow = git('rev-parse --is-shallow-repository') !== 'false';
  const base = shallow ? null : git('log -1 --format=%H -G"\\"version\\"" -- package.json');
  const count = base ? git(`rev-list --count ${base}..HEAD`) : null;
  const patch = count !== null && /^\d+$/.test(count) ? count : 'dev';
  return { version: `${major}.${minor}.${patch}`, commit, builtAt: now.toISOString() };
}
