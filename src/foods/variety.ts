/**
 * Varied "best foods" lists. Ranking all foods by amount puts every liver (veal, beef, lamb, raw,
 * fried, frozen…) at the top. This keeps the order but skips a food when it is similar to one
 * already listed: same BLS subgroup (first two code characters, e.g. K7 = mushrooms, V5 = offal)
 * or a shared main word in its English name ("liver", "kidney", "beef"). The full ranked list
 * is a separate view.
 */

/** Words that describe preparation or state, not what the food is. */
const IGNORED = new Set(
  'raw boiled cooked fresh dried whole stewed steamed braised baked fried grilled roasted smoked salted mature peeled canned drained deep frozen pasteurised ultra heated unsweetened sweetened natural plain fat without pan and or of the min dry matter'.split(' '),
);

/** Main words of a food name: the part before the first comma / "in" / "with", minus preparation words, singular. */
export function nameWords(nameEn: string): string[] {
  const main = nameEn.toLowerCase().split(/,| in | with /)[0] ?? '';
  const out = new Set<string>();
  for (const w of main.split(/[\s\-/()]+/)) {
    if (!w || IGNORED.has(w) || /^[0-9.%]+$/.test(w)) continue;
    out.add(w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
  }
  return [...out];
}

/** The first `n` items of an already ranked list, skipping variants of items already taken. */
export function diverseTop<T>(ranked: readonly T[], n: number, food: (item: T) => { code: string; nameEn: string }): T[] {
  const out: T[] = [];
  const bases = new Set<string>();
  const words = new Set<string>();
  for (const item of ranked) {
    if (out.length >= n) break;
    const f = food(item);
    const base = f.code.slice(0, 2);
    const ws = nameWords(f.nameEn);
    if (bases.has(base) || ws.some((w) => words.has(w))) continue;
    out.push(item);
    bases.add(base);
    ws.forEach((w) => words.add(w));
  }
  return out;
}
