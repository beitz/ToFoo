import { describe, expect, it } from "vitest";
import type { Ingredient } from "../storage/types";
import {
  comparePortions,
  headlineMoves,
  moveChange,
  recordChange,
  type RecipeState,
} from "./swapPreview";

const req = (recommended: number, limitOnly = false) =>
  ({
    nutrient: "",
    kind: "rda",
    recommended,
    physiological: recommended,
    physiologicalDerived: false,
    limitOnly,
    confidence: "high",
    source: "",
  }) as never;
const byNutrient = new Map([
  ["FE", req(15)],
  ["FOL", req(300)],
  ["NA", req(1500, true)],
  ["VITC", req(100)],
  ["CA", req(1000)],
  ["MG", req(300)],
]);
const status = new Map([
  ["FE", { status: "low" as const }],
  ["FOL", { status: "gettingLow" as const }],
  ["NA", { status: "tooHigh" as const }],
  ["VITC", { status: "fine" as const }],
  ["CA", { status: "fine" as const }],
  ["MG", { status: "fine" as const }],
]);

describe("swap preview: what a change does to one portion", () => {
  // Curry before and after adding 100 g spinach (made-up portion values, the shares are what count).
  const before = {
    intake: { ENERCC: 520, FE: 6, FOL: 60, NA: 900, VITC: 20, CA: 100, MG: 60 },
    missing: [],
  };
  const after = {
    intake: {
      ENERCC: 540,
      FE: 9.75,
      FOL: 135,
      NA: 920,
      VITC: 45,
      CA: 125,
      MG: 61,
    },
    missing: ["FOL"],
  };

  it('lists gaps, too high and big moves, the gaps\' moves counting most; small moves go under "other"', () => {
    const m = comparePortions(before, after, status, { byNutrient });
    expect(m.kcal).toEqual({ before: 520, after: 540 });
    expect(
      m.main.map((x) => [
        x.id,
        x.status,
        Math.round(x.before * 100),
        Math.round(x.after * 100),
        x.missing,
      ]),
    ).toEqual([
      ["FE", "low", 40, 65, false],
      ["FOL", "gettingLow", 20, 45, true],
      ["VITC", "fine", 20, 45, false],
      ["NA", "tooHigh", 60, 61, false],
    ]);
    // Calcium moves 2.5 points: listed, but not first. Magnesium moves less than a whole percent: not at all.
    expect(m.other.map((x) => x.id)).toEqual(["CA"]);
    expect(headlineMoves(m).map((x) => x.id)).toEqual(["FE", "FOL", "VITC"]);
  });

  it("shows nothing when nothing moves by a whole percent, and the other moves when no gap moves", () => {
    expect(comparePortions(before, before, status, { byNutrient })).toEqual({
      kcal: { before: 520, after: 520 },
      main: [],
      other: [],
    });
    const onlyCa = { ...before, intake: { ...before.intake, CA: 130 } };
    const m = comparePortions(before, onlyCa, status, { byNutrient });
    expect(m.main).toEqual([]);
    expect(headlineMoves(m).map((x) => x.id)).toEqual(["CA"]);
  });

  it("does not count what goes beyond a whole day for a nutrient to get enough of", () => {
    const rich = { ...before, intake: { ...before.intake, CA: 1870 } };
    const less = { ...before, intake: { ...before.intake, CA: 1100 } };
    const m = comparePortions(rich, less, status, { byNutrient });
    expect(m.main).toEqual([]);
    expect(
      m.other.map((x) => [
        x.id,
        Math.round(x.before * 100),
        Math.round(x.after * 100),
      ]),
    ).toEqual([["CA", 187, 110]]);
  });

  it("leaves out energy when an ingredient lacks it", () => {
    expect(
      comparePortions(before, { ...after, missing: ["ENERCC"] }, status, {
        byNutrient,
      }).kcal,
    ).toBeUndefined();
  });
});

describe("swap preview: which change the editor compares against", () => {
  const ing = (name: string, grams: number): Ingredient => ({
    ref: { source: "BLS", version: "4.0", code: name },
    name,
    grams,
    preparation: "asListed",
  });
  const curry: RecipeState = {
    portions: 4,
    ingredients: [ing("lentils", 250), ing("beef", 200)],
  };

  it("keeps editing the same ingredient as one change", () => {
    let last = recordChange(undefined, { kind: "ingredient", index: 2 }, curry);
    const withSpinach = {
      ...curry,
      ingredients: [...curry.ingredients, ing("spinach", 10)],
    };
    last = recordChange(
      last,
      { kind: "ingredient", index: 2, was: ing("spinach", 0) },
      withSpinach,
    );
    expect(last.before).toBe(curry);
    expect(last.change).toEqual({ kind: "ingredient", index: 2 });
    // Another ingredient, the portions or a removal start a new change.
    expect(
      recordChange(
        last,
        { kind: "ingredient", index: 0, was: ing("lentils", 250) },
        withSpinach,
      ).before,
    ).toBe(withSpinach);
    expect(
      recordChange(last, { kind: "portions", was: 4 }, withSpinach).change.kind,
    ).toBe("portions");
    const removed = recordChange(
      last,
      { kind: "removed", was: ing("beef", 200) },
      withSpinach,
    );
    expect(
      recordChange(
        removed,
        { kind: "removed", was: ing("lentils", 250) },
        curry,
      ).before,
    ).toBe(curry);
  });

  it("follows the ingredient when the list is reordered", () => {
    const last = recordChange(
      undefined,
      { kind: "ingredient", index: 1, was: ing("beef", 200) },
      curry,
    );
    expect(moveChange(last, 1, 0)?.change).toEqual({
      kind: "ingredient",
      index: 0,
      was: ing("beef", 200),
    });
    expect(moveChange(last, 0, 1)?.change).toMatchObject({ index: 0 });
    expect(moveChange(last, 2, 3)).toBe(last);
  });
});
