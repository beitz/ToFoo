/**
 * How good is the selenium method? Run with `npx tsx scripts/selenium-check.ts` after `npm run data`.
 *
 * Selenium can't be checked against BLS (BLS has none), so the same method — pair each BLS food with
 * its most alike CoFID food, scale by protein — is used to predict nutrients that both tables have,
 * with that nutrient left out of the comparison, and the prediction is compared with the BLS value.
 * Zinc is the closest stand-in: like selenium it sits mainly in protein-rich foods. The results are
 * in data/README.md.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BlsFile } from '../src/foods/blsTypes';
import { readCofid } from './cofid';
import { PROFILE, SELENIUM, bestMatch, estimateFrom, prepare, type BlsFoodLike } from './selenium';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const bls = JSON.parse(readFileSync(resolve(root, 'public/data/bls-4.0.json'), 'utf8')) as BlsFile;
const cofid = await readCofid(readFileSync(resolve(root, 'data/raw/CoFID_2021.xlsx')));

const ids = bls.nutrients.map((n) => n.id);
const foods: BlsFoodLike[] = bls.foods.map(([code, , nameEn, values]) => ({
  code,
  nameEn,
  per100: Object.fromEntries(ids.map((id, i) => [id, values[i] ?? null])),
}));

const pct = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? NaN;
};

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ['ZN', 'P', 'MG', 'CU', 'FE', 'K'];
for (const id of targets) {
  const p = PROFILE.find((x) => x.bls === id);
  if (!p) throw new Error(`${id} is not a profile nutrient`);
  const target = { cofid: p.cofid, factor: p.factor };
  const candidates = prepare(cofid, target);
  const errors: number[] = [];
  let matched = 0;
  let checked = 0;
  for (const f of foods) {
    const actual = f.per100[id];
    if (typeof actual !== 'number' || actual <= 0) continue;
    checked++;
    const m = bestMatch(f, candidates, id);
    if (!m) continue;
    matched++;
    const est = estimateFrom(f, m.cofid, target);
    const e = est === 't' ? 0 : est;
    if (e === null) continue;
    // Same floor as the profile comparison, so tiny amounts don't dominate.
    errors.push(Math.abs(Math.log((e + p.floor) / (actual + p.floor))));
  }
  const within = (r: number) => ((100 * errors.filter((x) => x <= Math.log(1 + r)).length) / errors.length).toFixed(0);
  console.log(
    `${id.padEnd(4)} matched ${matched}/${checked}  median error ×${Math.exp(pct(errors, 0.5)).toFixed(2)}  ` +
      `90th pct ×${Math.exp(pct(errors, 0.9)).toFixed(2)}  within ±25 % ${within(0.25)} %  within ±50 % ${within(0.5)} %`,
  );
}

const candidates = prepare(cofid, SELENIUM);
let withSe = 0;
for (const f of foods) if (bestMatch(f, candidates)) withSe++;
console.log(`Selenium: ${withSe}/${foods.length} BLS foods get a value (${candidates.length} CoFID foods with selenium)`);
