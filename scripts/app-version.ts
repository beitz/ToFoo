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

/** When a merged pull request went live: the version it became and the time it was merged. */
export interface Release {
  version: string;
  /** ISO time of the merge commit. */
  date: string;
}

/**
 * Version and merge time of every pull request on this branch's history, by number, for the version
 * history on the About page (owner's ask 2026-10-24). Pull requests are squash-merged with "(#123)" at the
 * end of the subject, so each is one commit, and its version is counted the same way as `buildInfo`'s:
 * commits since the package.json version change it sits on. Empty without the full history.
 */
export function releases(git: Git): Record<number, Release> {
  if (git('rev-parse --is-shallow-repository') !== 'false') return {};
  // Newest first, so the first one a commit sits on is the version line it was built with.
  const bases = (git('log --format=%H -G"\\"version\\"" -- package.json') ?? '')
    .split('\n')
    .filter(Boolean)
    .map((hash) => {
      const pkg = git(`show ${hash}:package.json`);
      const [major = '0', minor = '0'] = ((pkg && (JSON.parse(pkg) as { version?: string }).version) || '0.0').split('.');
      return { hash, prefix: `${major}.${minor}` };
    });
  const out: Record<number, Release> = {};
  for (const line of (git('log --first-parent --format=%H%x09%cI%x09%s HEAD') ?? '').split('\n')) {
    const [hash = '', date = '', subject = ''] = line.split('\t');
    const pr = /\(#(\d+)\)$/.exec(subject)?.[1];
    if (!pr || out[Number(pr)]) continue;
    // `merge-base --is-ancestor` prints nothing and succeeds when it is; runGit gives null when it fails.
    const base = bases.find((b) => b.hash === hash || git(`merge-base --is-ancestor ${b.hash} ${hash}`) !== null);
    const count = base ? git(`rev-list --count ${base.hash}..${hash}`) : null;
    if (base && count !== null && /^\d+$/.test(count)) out[Number(pr)] = { version: `${base.prefix}.${count}`, date };
  }
  return out;
}
