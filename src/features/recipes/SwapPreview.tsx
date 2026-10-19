import { useMemo, useState, type ReactNode } from "react";
import { useData } from "../../app/data";
import { t } from "../../i18n";
import { fmtAmount, fmtPercent } from "../../lib/format";
import { itemIngredient } from "../../logic/ingredients";
import { portionIntake } from "../../logic/recipeIdeas";
import {
  comparePortions,
  headlineMoves,
  type PortionMove,
  type RecipeState,
  type ShareMove,
} from "../../logic/swapPreview";
import type { Product } from "../../storage/types";
import { StatusBadge } from "../../ui/status";
import type { SavedIngredient } from "./IngredientSheet";

const NO_PRODUCTS: readonly Product[] = [];

/**
 * How one portion moves between two versions of a recipe (eaten fresh, after cooking losses),
 * computed by the app from the database values. `products` adds products not saved on the phone
 * yet (one just picked in the ingredient sheet).
 */
export function usePortionMove(
  before: RecipeState,
  after: RecipeState,
  products: readonly Product[] = NO_PRODUCTS,
): PortionMove | undefined {
  const d = useData();
  return useMemo(() => {
    if (
      !before.portions ||
      before.portions < 1 ||
      !after.portions ||
      after.portions < 1
    )
      return undefined;
    const ctx = {
      foods: d.foods,
      products: products.length
        ? new Map([
            ...d.productsById,
            ...products.map((p) => [p.id, p] as const),
          ])
        : d.productsById,
      batches: new Map(),
      customFoods: new Map(),
      salt: d.profile.salt,
    };
    const portion = (s: RecipeState) =>
      portionIntake(
        {
          name: "",
          portions: Math.round(s.portions!),
          ingredients: s.ingredients,
          ...(s.saltOverride ? { saltOverride: s.saltOverride } : {}),
        },
        ctx,
      );
    return comparePortions(
      portion(before),
      portion(after),
      d.model.nutrients,
      d.requirements,
    );
  }, [
    before,
    after,
    products,
    d.foods,
    d.productsById,
    d.profile.salt,
    d.model.nutrients,
    d.requirements,
  ]);
}

/** Rows shown before "Show all": the most urgent moves. */
const FIRST_ROWS = 6;

const arrow = (m: ShareMove) => (m.after > m.before ? "↑" : "↓");

function Move({ m }: { m: ShareMove }) {
  return (
    <span className="swap-move">
      {fmtPercent(m.before)} → <strong>{fmtPercent(m.after)}</strong>{" "}
      <span aria-label={t(m.after > m.before ? "swap.up" : "swap.down")}>
        {arrow(m)}
      </span>
    </span>
  );
}

/** One line next to the ingredient being changed: the gaps it moves most. */
export function SwapLine({ move }: { move: PortionMove | undefined }) {
  const top = move ? headlineMoves(move) : [];
  if (top.length === 0) return null;
  return (
    <p className="swap-line small" aria-live="polite">
      <span className="muted">{t("swap.perPortion")}</span>{" "}
      {top.map((m, i) => (
        <span key={m.id}>
          {i > 0 && " · "}
          <span className="nowrap">
            {m.name} <Move m={m} />
          </span>
        </span>
      ))}
    </p>
  );
}

/** The full preview: the change in words, energy, and every nutrient that moves, gaps first. */
export function SwapPreview({
  title,
  move,
  pending,
  children,
}: {
  title: ReactNode;
  move: PortionMove | undefined;
  pending?: boolean;
  children?: ReactNode;
}) {
  const [all, setAll] = useState(false);
  if (!move) return null;
  if (pending)
    return (
      <div className="card swap-preview" aria-live="polite">
        <h3 className="swap-title">{t("swap.title")}</h3>
        {children}
        <p className="swap-what">{title}</p>
      </div>
    );
  // Without a gap or a big move, the small moves are all there is to show.
  const onlySmall = move.main.length === 0;
  const every = [...move.main, ...move.other];
  const rows = all || onlySmall ? every : move.main.slice(0, FIRST_ROWS);
  const hidden = every.length - rows.length;
  const kcalMoves =
    move.kcal && Math.round(move.kcal.before) !== Math.round(move.kcal.after);
  const nothing = move.main.length === 0 && move.other.length === 0;
  return (
    <div className="card swap-preview" aria-live="polite">
      <h3 className="swap-title">{t("swap.title")}</h3>
      {children}
      <p className="swap-what">{title}</p>
      {move.kcal && kcalMoves && (
        <p className="small">
          {t("swap.energy", {
            before: fmtAmount("ENERCC", move.kcal.before),
            after: fmtAmount("ENERCC", move.kcal.after),
          })}
        </p>
      )}
      {nothing ? (
        <p className="muted small">{t("swap.nothing")}</p>
      ) : (
        <>
          {rows.length > 0 && (
            <table className="nutrient-table swap-table">
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.name}
                      {m.limitOnly && (
                        <span className="muted small">
                          {" "}
                          {t("swap.ofLimit")}
                        </span>
                      )}
                      {m.missing && (
                        <span
                          className="muted small"
                          title={t("food.someMissing")}
                        >
                          {" "}
                          *
                        </span>
                      )}
                    </td>
                    <td>
                      {m.status !== "fine" &&
                        m.status !== "unknown" &&
                        m.status !== "info" && (
                          <StatusBadge status={m.status} compact />
                        )}
                    </td>
                    <td className="num">
                      <Move m={m} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {onlySmall && <p className="muted small">{t("swap.noGaps")}</p>}
          {(all || hidden > 0) && (
            <button
              className="btn btn-small btn-ghost"
              onClick={() => setAll(!all)}
            >
              {all
                ? t("swap.showFewer")
                : t("swap.showMore", { n: every.length })}
            </button>
          )}
        </>
      )}
      <p className="muted small">{t("swap.hint")}</p>
    </div>
  );
}

/** In the ingredient sheet: what saving this ingredient (new, or in place of ingredient `index`) would do to one portion. */
export function IngredientSwapLine({
  state,
  index,
  item,
}: {
  state: RecipeState;
  index?: number;
  item?: SavedIngredient;
}) {
  const d = useData();
  const after = useMemo<RecipeState>(() => {
    if (!item) return state;
    const ing = itemIngredient(item, d.foods.version, d.profile.salt);
    return {
      ...state,
      ingredients:
        index === undefined
          ? [...state.ingredients, ing]
          : state.ingredients.map((x, j) => (j === index ? ing : x)),
    };
  }, [state, index, item, d.foods.version, d.profile.salt]);
  const products = useMemo(
    () => (item?.product ? [item.product] : NO_PRODUCTS),
    [item?.product],
  );
  return <SwapLine move={usePortionMove(state, after, products)} />;
}
