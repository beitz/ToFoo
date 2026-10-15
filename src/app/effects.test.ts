import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('effects', () => {
  it('never return a plain expression (React would call it as cleanup)', () => {
    // `useEffect(() => window.scrollTo(0, 0))` returns a Promise in newer Chrome; React then calls
    // it on the next render and the whole app unmounts. Use braces, `void`, or return a function.
    const offenders = sourceFiles(join(__dirname, '..')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, i }))
        .filter(({ line }) => /use(Layout)?Effect\(\(\) => (?![{(]|void\b)/.test(line))
        .map(({ i }) => `${file}:${i + 1}`),
    );
    expect(offenders).toEqual([]);
  });
});
