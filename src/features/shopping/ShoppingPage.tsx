import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { errorText } from '../../lib/shareFile';
import { amountText, bySection, isOpen, onList, planClear, planTick, shareText } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { type HomePlace, type ShoppingItem } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { SwipeRow } from '../../ui/SwipeRow';
import { ItemSheet, sectionName } from './ItemSheet';
import { RecipeToListSheet } from './RecipeToListSheet';
import { useShopping } from './useShopping';
import { ShoppingAdd } from './ShoppingAdd';
import { useWakeLock } from './useWakeLock';
import { isOn } from '../../settings/features';
import { placeName } from '../pantry/usePantry';
import { usePutAway } from '../pantry/usePutAway';
import { useGaps } from '../recipes/useGaps';
import { portionGrams } from '../../model/ranking';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { BackButton } from '../../ui/BackButton';

/** A line just ticked off stays in view this long, ticked, before it hides (a wrong tap can be taken back). */
const LINGER_MS = 1500;

/**
 * Route #/shopping: the shopping list. Everything is on the phone, so it works in a shop without
 * a connection. Type to add (things bought before come back as suggestions), add a recipe's
 * ingredients, tap a line to put it in the trolley, swipe it left to delete it.
 *
 * Owner's rework (2026-11-27): the list keeps its order while shopping; ticked lines hide (a
 * switch shows them again, in their place); a section heading ticks everything under it; and
 * whatever is ticked can be put away at home, unticked or deleted in one tap from the bar above
 * the add box.
 */
export function ShoppingPage() {
  const d = useData();
  const toast = useToast();
  const all = useShopping();
  const [fromRecipe, setFromRecipe] = useState(false);
  const [editing, setEditing] = useState<ShoppingItem | null>(null);
  const [showTicked, setShowTicked] = useState(false);
  const [lingering, setLingering] = useState<ReadonlySet<string>>(new Set());
  const timers = useRef<number[]>([]);
  useEffect(() => () => timers.current.forEach((id) => window.clearTimeout(id)), []);
  const atHome = isOn(d.settings.features, 'atHome');
  const { placeFor, putAway } = usePutAway();
  const items = useMemo(() => (all ?? []).filter(onList), [all]);
  const toBuy = items.filter(isOpen);
  const trolley = items.filter((i) => i.checkedAt !== undefined);
  const shown = (i: ShoppingItem) => isOpen(i) || showTicked || lingering.has(i.id);
  useWakeLock(items.length > 0);

  function linger(ids: readonly string[]) {
    setLingering((prev) => new Set([...prev, ...ids]));
    const timer = window.setTimeout(() => {
      setLingering((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
      timers.current = timers.current.filter((x) => x !== timer);
    }, LINGER_MS);
    timers.current.push(timer);
  }

  async function tick(ids: readonly string[], on: boolean) {
    await repo.changeShopping((current) => planTick(current, ids, on, Date.now()));
    if (on) linger(ids);
  }

  async function remove(item: ShoppingItem) {
    const undo = await repo.changeShopping((current) => planClear(current, Date.now(), [item.id]));
    toast(t('shopping.removed', { name: item.name }), () => repo.undoShopping(undo));
  }

  async function putAwayOne(item: ShoppingItem, place: HomePlace) {
    const { undo } = await putAway([item], place);
    toast(t('shopping.putAwayOne', { name: item.name, place: placeName(place) }), () => repo.undoHome(undo));
  }

  async function putAwayTrolley() {
    const { undo, stored, left } = await putAway(trolley);
    const message = !stored ? t('shopping.deleted', { n: left }) : left ? t('shopping.putAwayDoneOther', { n: stored, other: left }) : t('shopping.putAwayDone', { n: stored });
    toast(message, () => repo.undoHome(undo));
  }

  async function untickTrolley() {
    const ids = trolley.map((i) => i.id);
    const undo = await repo.changeShopping((current) => planTick(current, ids, false, Date.now()));
    toast(t('shopping.backOnList', { n: ids.length }), () => repo.undoShopping(undo));
  }

  async function deleteTrolley() {
    const ids = trolley.map((i) => i.id);
    const undo = await repo.changeShopping((current) => planClear(current, Date.now(), ids));
    toast(t('shopping.deleted', { n: ids.length }), () => repo.undoShopping(undo));
  }

  async function share() {
    const body = shareText(items, t('shopping.title'), sectionName);
    try {
      if (navigator.share) await navigator.share({ text: body });
      else {
        await navigator.clipboard.writeText(body);
        toast(t('shopping.copied'));
      }
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') return;
      toast(t('shopping.shareFailed', { error: errorText(e) }));
    }
  }

  const done = items.length > 0 ? trolley.length / items.length : 0;
  const groups = bySection(items)
    .map((g) => ({ section: g.section, items: g.items.filter(shown) }))
    .filter((g) => g.items.length > 0);
  const firstLine = groups[0]?.items[0]?.id;

  return (
    <section className="shopping-page">
      <header className="page-head row-between">
        <BackButton to={['kitchen']} />
        <h1 className="grow">{t('shopping.title')}</h1>
        <button className="icon-btn" onClick={() => void share()} disabled={toBuy.length === 0} aria-label={t('shopping.share')} title={t('shopping.share')}>
          <Icon name="share" />
        </button>
      </header>
      {/* Under the title, not beside it: "Shopping list" needs the header's width at 360 px. */}
      <div className="shop-progress">
        {items.length > 0 && <span className="small muted">{t('shopping.progress', { get: toBuy.length, trolley: trolley.length })}</span>}
        <span className="offline-pill small">
          <Icon name="check" size={14} /> {t('shopping.offline')}
        </span>
        {items.length > 0 && (
          <span className="shop-bar" aria-hidden>
            <span style={{ width: `${done * 100}%` }} />
          </span>
        )}
      </div>
      {trolley.length > 0 && (
        <button className={`chip shop-show${showTicked ? ' on' : ''}`} aria-pressed={showTicked} onClick={() => setShowTicked(!showTicked)} data-tour="shopping.show">
          <Icon name="eye" size={16} /> {t(showTicked ? 'shopping.hideTicked' : 'shopping.showTicked', { n: trolley.length })}
        </button>
      )}

      {all && items.length === 0 && <p className="muted empty">{t('shopping.empty')}</p>}
      {items.length > 0 && toBuy.length === 0 && !showTicked && lingering.size === 0 && <p className="muted empty">{t('shopping.allInBasket')}</p>}
      {/* The order lines were added in, ticked or not, so nothing jumps while shopping. */}
      {groups.map((g, gi) => {
        const ticked = g.items.filter((i) => !isOpen(i)).length;
        const state = ticked === 0 ? false : ticked === g.items.length ? true : ('mixed' as const);
        return (
          <div key={g.section}>
            <button
              className="shop-section"
              role="checkbox"
              aria-checked={state}
              aria-label={t('shopping.tickSection', { name: sectionName(g.section) })}
              onClick={() =>
                void tick(
                  (state === true ? g.items : g.items.filter(isOpen)).map((i) => i.id),
                  state !== true,
                )
              }
              {...(gi === 0 ? { 'data-tour': 'shopping.heading' } : {})}
            >
              <span className={`shop-check small${state === true ? ' on' : state === 'mixed' ? ' some' : ''}`} aria-hidden>
                {state === true && <Icon name="check" size={14} />}
                {state === 'mixed' && <Icon name="minus" size={14} />}
              </span>
              {sectionName(g.section)}
            </button>
            <ul className="plain-list shop-list">
              {g.items.map((i) => {
                const place = atHome && !isOpen(i) ? placeFor(i) : undefined;
                return (
                  <li key={i.id} {...(i.id === firstLine ? { 'data-tour': 'shopping.line' } : {})}>
                    <SwipeRow left={{ label: t('shopping.delete'), icon: 'trash', tone: 'danger', run: () => void remove(i) }}>
                      <Row
                        item={i}
                        goesTo={place}
                        onToggle={() => void tick([i.id], isOpen(i))}
                        onPutAway={place ? () => void putAwayOne(i, place) : undefined}
                        onEdit={() => setEditing(i)}
                      />
                    </SwipeRow>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}

      <button className="btn btn-secondary btn-block shop-from-recipe" onClick={() => setFromRecipe(true)}>
        <Icon name="recipes" size={18} /> {t('shopping.fromRecipe')}
      </button>
      {items.length > 0 && 'wakeLock' in navigator && <p className="muted small shop-awake">{t('shopping.screenOn')}</p>}

      <ShoppingAdd
        docked
        above={
          trolley.length > 0 && (
            <div className="shop-bulk" role="group" aria-label={t('shopping.basket', { n: trolley.length })} data-tour="shopping.actions">
              <span className="shop-bulk-n" title={t('shopping.basket', { n: trolley.length })}>
                <Icon name="check" size={16} /> {trolley.length}
              </span>
              {atHome && (
                <button className="btn btn-small btn-secondary" onClick={() => void putAwayTrolley()}>
                  <Icon name="pantry" size={16} /> {t('shopping.putAway')}
                </button>
              )}
              <button className="btn btn-small btn-secondary" onClick={() => void untickTrolley()}>
                <Icon name="undo" size={16} /> {t('shopping.untick')}
              </button>
              <button className="btn btn-small btn-secondary shop-bulk-delete" onClick={() => void deleteTrolley()}>
                <Icon name="trash" size={16} /> {t('shopping.delete')}
              </button>
            </div>
          )
        }
      />

      {fromRecipe && <RecipeToListSheet onClose={() => setFromRecipe(false)} />}
      {editing && <ItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

/**
 * One line as a card (design 2026-10-22, "Basket in the shop"): tap to put it in the trolley (or
 * back), the pen to change it. Under the name: the recipes it is for, else which of the user's gaps
 * a portion of it fills, else that it was typed. A ticked line has a button for where it goes at
 * home, which puts it there (it used to be a label inside the tick button, so tapping it only
 * unticked the line; owner, 2026-11-27).
 */
function Row({ item, goesTo, onToggle, onPutAway, onEdit }: { item: ShoppingItem; goesTo?: HomePlace; onToggle: () => void; onPutAway?: () => void; onEdit: () => void }) {
  const fills = useFills(item);
  const done = item.checkedAt !== undefined;
  const amount = amountText(item);
  return (
    <div className={`shop-item${done ? ' done' : ''}`}>
      <button className="shop-row" role="checkbox" aria-checked={done} onClick={onToggle}>
        <span className={`shop-check${done ? ' on' : ''}`} aria-hidden>
          {done && <Icon name="check" size={16} />}
        </span>
        <span className="shop-text">
          <span className="shop-name">
            {item.name}
            {amount && <span className="shop-amount"> {amount}</span>}
          </span>
          <span className="muted small shop-for">
            {item.recipes?.length ? (
              <>
                <Icon name="pot" size={14} /> {t('shopping.forRecipes', { names: item.recipes.join(', ') })}
              </>
            ) : fills.length ? (
              <>
                <Icon name="target" size={14} /> {t('shopping.fills', { names: fills.join(', ') })}
              </>
            ) : !item.ref ? (
              <>
                <Icon name="edit" size={14} /> {t('shopping.typed')}
              </>
            ) : null}
          </span>
        </span>
      </button>
      {goesTo && onPutAway && (
        <button className="shop-goes small" onClick={onPutAway} aria-label={t('shopping.putAwayIn', { name: item.name, place: placeName(goesTo) })}>
          → {placeName(goesTo)}
        </button>
      )}
      <button className="icon-btn shop-edit" onClick={onEdit} aria-label={t('shopping.editItem', { name: item.name })}>
        <Icon name="edit" size={18} />
      </button>
    </div>
  );
}

/** A gap this item fills: one usual portion of its food gives at least this share of a day's need. */
const FILLS_SHARE = 0.1;

/** The user's gaps (low or a bit low) one portion of the item's food fills well, biggest first, at most two. */
function useFills(item: ShoppingItem): string[] {
  const d = useData();
  const gaps = useGaps();
  return useMemo(() => {
    const food = item.ref?.source === 'BLS' ? d.foods.byCode.get(item.ref.code) : undefined;
    if (!food) return [];
    const grams = portionGrams(food.per100);
    return [...gaps.keys()]
      .flatMap((id) => {
        const v = food.per100[id];
        const req = d.requirements.byNutrient.get(id);
        if (typeof v !== 'number' || !req) return [];
        const share = (v * grams) / 100 / req.recommended;
        return share >= FILLS_SHARE ? [{ id, share }] : [];
      })
      .sort((a, b) => b.share - a.share)
      .slice(0, 2)
      .map((x) => (NUTRIENT_BY_ID.get(x.id)?.name ?? x.id).replace(/ \(.*\)$/, ''));
  }, [item.ref, gaps, d.foods, d.requirements]);
}
