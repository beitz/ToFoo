/**
 * One-off conversion: data/raw/2024_Adult_Compendium.pdf → src/activities/compendium-2024.json
 *
 * Run with `npm run compendium` when the PDF changes (needs `pdftotext` from poppler-utils, so it is
 * not part of `npm run data` and the JSON is committed). The format is documented in data/README.md.
 * MET values and descriptions are kept exactly as printed: the Compendium asks not to change MET
 * values or combine activities.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PDF = resolve(root, 'data/raw/2024_Adult_Compendium.pdf');
const OUT = resolve(root, 'src/activities/compendium-2024.json');

/** [code, MET, description] */
export type CompendiumRow = [string, number, string];

const ROW = /^\s*([A-Za-z][A-Za-z &]*?)\s+(\d{5})\s+(\d+(?:\.\d+)?)(?:\s+(.*))?$/;

/**
 * Rows from `pdftotext -layout` text. A long description is wrapped around its row: the start on
 * the line above, the rest on the line below, with the code and MET alone on the middle line.
 */
export function parseCompendium(text: string): CompendiumRow[] {
  const rows: CompendiumRow[] = [];
  let before: string[] = [];
  let needsTail = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('2024 Adult Compendium') || line.startsWith('Major Heading')) continue;
    const m = ROW.exec(raw);
    if (m) {
      const desc = (m[4] ?? '').trim();
      if (desc && before.length) throw new Error(`Unplaced text before ${m[2]}: ${before.join(' ')}`);
      rows.push([m[2]!, Number(m[3]), desc || before.join(' ')]);
      needsTail = !desc;
      before = [];
    } else if (needsTail) {
      const last = rows[rows.length - 1]!;
      last[2] = `${last[2]} ${line}`;
      needsTail = false;
    } else before.push(line);
  }
  if (before.length) throw new Error(`Unplaced text at the end: ${before.join(' ')}`);
  return rows.map(([code, met, desc]) => [code, met, desc.replace(/\s+/g, ' ').replace(/\s+\)/g, ')').trim()]);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = execFileSync('pdftotext', ['-layout', PDF, '-'], { encoding: 'utf8' });
  const rows = parseCompendium(text);
  const codes = new Set(rows.map((r) => r[0]));
  if (codes.size !== rows.length) throw new Error('Duplicate activity codes');
  const file = {
    source: 'Herrmann SD et al. (2024): 2024 Adult Compendium of Physical Activities. J Sport Health Sci 13(1):6–12; list from pacompendium.com',
    url: 'https://pacompendium.com/adult-compendium',
    rows,
  };
  writeFileSync(OUT, `${JSON.stringify(file, null, 0).replace(/\],\[/g, '],\n[')}\n`);
  console.log(`${rows.length} activities → ${OUT}`);
}
