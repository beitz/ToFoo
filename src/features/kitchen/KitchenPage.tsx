import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { onShoppingList, type Left } from '../../logic/pantry';
import { amountText, isOpen, onList } from '../../logic/shopping';
import { kitchenPlaces, placeCount, sectionInView } from '../../logic/kitchen';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import type { Batch, HomePlace, PantryItem } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { AskChips } from '../../ui/AskChips';
import { formatDay } from '../../lib/dates';
import { refKey } from '../../lib/refs';
import { useShopping } from '../shopping/useShopping';
import { ShoppingAdd } from '../shopping/ShoppingAdd';
import { PutAwaySheet } from '../pantry/PutAwaySheet';
import { PantryItemSheet } from '../pantry/PantryItemSheet';
import { leftLabel, placeName, usePantry, usePantryLeft } from '../pantry/usePantry';
import { SettingsButton } from '../../ui/SettingsButton';
import { FoodSourceTag } from '../food/FoodSourceTag';
import { PantryAdd } from './PantryAdd';
import { Segmented } from '../../ui/controls';
import { FoodIcon } from '../../ui/FoodIcon';
import { HomeTiles, type HomeTile } from '../log/HomeTiles';
import { potKey, useHomeLooks } from '../pantry/useHomeLooks';
import type { HomeTileLook } from '../pantry/useHomeLooks';

const PLACE_ICON: Record<HomePlace, string> = { fridge: 'fridge', freezer: 'snow', cupboard: 'pantry', spices: 'leaf' };
/** How many things of the shopping list the card lists before "and N more". */
const LIST_SHOWN = 6;

/** Which card has its add box open: a place at home, or the shopping list. */
type Adding = HomePlace | 'shopping';

/**
 * The Kitchen tab (#/kitchen, also #/athome; design 2026-10-22, "Kitchen · one flow"): an overview
 * of how much is where that stays at the top and marks the section in view (tap to jump), then one
 * card each for the fridge, freezer, cupboard and spices, and the shopping list last. Type (or scan)
 * what was bought, or tap a card's "+" to put it straight there; tap a thing to change how much is
 * left, mark it running low or used up. Amounts go down by themselves as meals and pots are logged.
 * Recipes are one tap away in the header.
 *
 * The shopping list is what is still to get, not a place at home (owner, 2026-10-23: "Basket" read
 * like a basket at home): its tile sits apart at the right end, dashed, with a cart, and opens the
 * list itself; its card comes after everything at home.
 */
export function KitchenPage() {
  const d = useData();
  const toast = useToast();
  const all = usePantry();
  const shopping = useShopping();
  const left = usePantryLeft();
  const [editing, setEditing] = useState<PantryItem | null>(null);
  const [puttingAway, setPuttingAway] = useState(false);
  const [adding, setAdding] = useState<Adding | null>(null);
  const shoppingOn = isOn(d.settings.features, 'shoppingList');
  const homeOn = isOn(d.settings.features, 'atHome');
  // Icons by default (owner's pick, 2026-11-07); the list keeps amounts and source tags in words.
  const grid = (d.settings.kitchenView ?? 'grid') === 'grid';
  const looks = useHomeLooks();
  const itemTile = (i: PantryItem, out = false): HomeTile => {
    const l = left(i);
    const look = looks(i.id);
    const status = l.out ? t('pantry.out') : l.low ? t('pantry.low') : '';
    return {
      key: i.id,
      icon: look?.icon,
      ...(look ? { kind: look.kind } : {}),
      monogram: look?.monogram ?? i.name.slice(0, 2),
      short: look?.short ?? i.name,
      full: i.name,
      detail: [leftLabel(i, l), status].filter(Boolean).join(' · '),
      added: 0,
      out,
      onTap: () => setEditing(i),
    };
  };
  const potTile = (batch: Batch, portions: number): HomeTile => {
    const look = looks(potKey(batch));
    return {
      key: potKey(batch),
      icon: look?.icon,
      kind: 'cooked',
      monogram: look?.monogram ?? batch.recipe.name.slice(0, 2),
      short: look?.short ?? batch.recipe.name,
      full: batch.recipe.name,
      detail: `${t('kitchen.portions', { n: portions })} · ${t('kitchen.cooked', { day: formatDay(batch.cookedDay) })}`,
      added: 0,
      onTap: () => navigate('recipes', batch.recipeId),
    };
  };

  const items = all ?? [];
  const here = items.filter((i) => !left(i).out);
  const usedUp = items.filter((i) => left(i).out).sort((a, b) => a.name.localeCompare(b.name));
  const places = kitchenPlaces(here, d.batches);
  const toGet = (shopping ?? []).filter(isOpen);
  const trolley = (shopping ?? []).filter((s) => onList(s) && s.checkedAt !== undefined);

  // The overview: one tile per place at home, each counting what it holds (the list's tile is apart).
  const sections: Array<{ key: HomePlace; label: string; icon: string; count: number }> = homeOn
    ? places.map((p) => ({ key: p.place, label: t(`kitchen.tile.${p.place}` as MessageKey), icon: PLACE_ICON[p.place], count: placeCount(p) }))
    : [];
  const refs = useRef(new Map<string, HTMLElement>());
  const tilesRef = useRef<HTMLElement>(null);
  const [inView, setInView] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      // A section counts as in view once its top passes a quarter of the screen below the overview.
      const line = (tilesRef.current?.getBoundingClientRect().bottom ?? 0) + window.innerHeight / 4;
      const tops = sections.map((s) => refs.current.get(s.key)?.getBoundingClientRect().top ?? Infinity);
      setInView(sectionInView(tops, line));
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  });
  const jump = (key: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    refs.current.get(key)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };
  const sectionRef = (key: string) => (el: HTMLElement | null) => {
    if (el) refs.current.set(key, el);
    else refs.current.delete(key);
  };
  // The bin on the Used up card (owner's ask 2026-10-26): clears them all in one go, with undo.
  async function clearUsedUp() {
    const ids = usedUp.map((i) => i.id);
    const undo = await repo.changeHome(() => ({ pantry: { put: [], remove: ids } }));
    toast(t('pantry.clearedUsedUp', { n: ids.length }), () => repo.undoHome(undo));
  }

  /** The "+" in a card's heading: opens that card's add box (one at a time), or closes it again. */
  const addButton = (key: Adding, label: string) => {
    const open = adding === key;
    return (
      <button type="button" className={`icon-btn card-add${open ? ' on' : ''}`} onClick={() => setAdding(open ? null : key)} aria-expanded={open} aria-label={open ? t('kitchen.closeAdd') : label} title={open ? t('kitchen.closeAdd') : label}>
        <Icon name={open ? 'close' : 'plus'} size={20} />
      </button>
    );
  };

  return (
    <section className="kitchen-page">
      <header className="page-head row-between">
        <h1 className="grow">{t('kitchen.title')}</h1>
        <a className="btn btn-small btn-secondary" href={href('recipes')} data-tour="kitchen.recipes">
          <Icon name="recipes" size={18} /> {t('recipes.title')}
        </a>
        <SettingsButton />
      </header>
      {homeOn && <AskChips questions={[t('kitchen.ask')]} />}

      {(sections.length > 0 || shoppingOn) && (
        <nav className="kitchen-tiles" ref={tilesRef} aria-label={t('kitchen.overview')} data-tour="kitchen.tiles">
          {sections.map((sec, i) => (
            <button key={sec.key} type="button" className={`kitchen-tile${i === inView ? ' on' : ''}`} aria-current={i === inView ? 'location' : undefined} onClick={() => jump(sec.key)}>
              <Icon name={sec.icon} size={22} />
              <strong>{sec.count}</strong>
              <span>{sec.label}</span>
            </button>
          ))}
          {shoppingOn && sections.length > 0 && <span className="kitchen-tiles-sep" aria-hidden />}
          {shoppingOn && (
            <a className="kitchen-tile kitchen-tile-list" data-tour="kitchen.shopping" href={href('shopping')} aria-label={t('kitchen.tileListLabel', { n: toGet.length })}>
              <Icon name="cart" size={22} />
              <strong>{toGet.length}</strong>
              <span>{t('kitchen.tile.shopping')}</span>
            </a>
          )}
        </nav>
      )}

      {homeOn && <PantryAdd />}

      {homeOn && (items.length > 0 || places.some((p) => p.portions.length > 0)) && (
        <div className="kitchen-view" data-tour="kitchen.view">
          <Segmented
            label={t('kitchen.view')}
            value={grid ? 'grid' : 'list'}
            onChange={(v) => void repo.updateSettings({ kitchenView: v })}
            options={[
              { value: 'grid', label: t('kitchen.viewGrid') },
              { value: 'list', label: t('kitchen.viewList') },
            ]}
          />
        </div>
      )}

      {homeOn && all && items.length === 0 && d.batches.every((b) => b.remaining.fresh + b.remaining.fridge + b.remaining.freezer === 0) && <p className="muted empty">{t('pantry.empty')}</p>}

      {homeOn &&
        places.map((p) => (
          <div key={p.place} className="card kitchen-section" ref={sectionRef(p.place)}>
            <div className="card-head">
              <h2>{placeName(p.place)}</h2>
              {addButton(p.place, t('kitchen.addTo', { place: placeName(p.place) }))}
            </div>
            {adding === p.place && (
              <div className="card-add-box">
                <PantryAdd place={p.place} autoFocus placeholder={t('kitchen.addTo', { place: placeName(p.place) })} />
              </div>
            )}
            {placeCount(p) === 0 ? (
              adding !== p.place && <p className="muted small">{t('kitchen.placeEmpty')}</p>
            ) : grid ? (
              <HomeTiles tiles={[...p.portions.map(({ batch, portions }) => potTile(batch, portions)), ...p.items.map((i) => itemTile(i))]} />
            ) : (
              <ul className="plain-list shop-list">
                {p.portions.map(({ batch, portions }) => (
                  <li key={batch.id}>
                    <PotRow batch={batch} portions={portions} look={looks(potKey(batch))} />
                  </li>
                ))}
                {p.items.map((i) => (
                  <li key={i.id}>
                    <Row item={i} look={looks(i.id)} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}

      {homeOn && usedUp.length > 0 && (
        <div className="card">
          <div className="card-head">
            <h2>{t('pantry.usedUpN', { n: usedUp.length })}</h2>
            <button type="button" className="icon-btn card-add" onClick={() => void clearUsedUp()} aria-label={t('pantry.clearUsedUp')} title={t('pantry.clearUsedUp')}>
              <Icon name="trash" size={20} />
            </button>
          </div>
          {grid ? (
            <HomeTiles tiles={usedUp.map((i) => itemTile(i, true))} />
          ) : (
            <ul className="plain-list shop-list">
              {usedUp.map((i) => (
                <li key={i.id}>
                  <Row item={i} look={looks(i.id)} left={left(i)} onList={onShoppingList(i, shopping ?? [])} onEdit={() => setEditing(i)} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {homeOn && items.length > 0 && <p className="muted small pantry-hint">{t('pantry.hint')}</p>}

      {shoppingOn && (
        <div className="card kitchen-section kitchen-list">
          <div className="card-head">
            <h2>
              <Icon name="cart" size={20} /> {t('kitchen.shoppingList')}
            </h2>
            <a className="card-note" href={href('shopping')}>
              {t('kitchen.openList')}
            </a>
            {addButton('shopping', t('kitchen.addToList'))}
          </div>
          {adding === 'shopping' && (
            <div className="card-add-box">
              <ShoppingAdd autoFocus />
            </div>
          )}
          {toGet.length === 0 ? (
            adding !== 'shopping' && <p className="muted small">{t('kitchen.listEmpty')}</p>
          ) : (
            <ul className="plain-list shop-list">
              {toGet.slice(0, LIST_SHOWN).map((i) => (
                <li key={i.id}>
                  <a className="home-row" href={href('shopping')}>
                    <span className="shop-text">
                      <span className="shop-name">{i.name}</span>
                    </span>
                    {amountText(i) && <span className="shop-amount">{amountText(i)}</span>}
                  </a>
                </li>
              ))}
              {toGet.length > LIST_SHOWN && (
                <li>
                  <a className="home-row muted" href={href('shopping')}>
                    {t('kitchen.moreToGet', { n: toGet.length - LIST_SHOWN })}
                  </a>
                </li>
              )}
            </ul>
          )}
          {homeOn && trolley.length > 0 && (
            <button className="btn btn-secondary btn-block" onClick={() => setPuttingAway(true)}>
              <Icon name="pantry" size={18} /> {t('pantry.putAwayBasket', { n: trolley.length })}
            </button>
          )}
        </div>
      )}

      {editing && <PantryItemSheet key={editing.id} item={editing} onClose={() => setEditing(null)} />}
      {puttingAway && <PutAwaySheet onClose={() => setPuttingAway(false)} />}
    </section>
  );
}

/** Cooked portions kept in one place: the dish, how many, and its recipe one tap away. */
function PotRow({ batch, portions, look }: { batch: Batch; portions: number; look: HomeTileLook | undefined }) {
  return (
    <a className="home-row" href={href('recipes', batch.recipeId)}>
      <FoodIcon icon={look?.icon} monogram={look?.monogram ?? ''} size={36} kind={look?.kind} />
      <span className="shop-text">
        <span className="shop-name">{batch.recipe.name}</span>
        <span className="small muted">{t('kitchen.cooked', { day: formatDay(batch.cookedDay) })}</span>
      </span>
      <span className="shop-amount">{t('kitchen.portions', { n: portions })}</span>
    </a>
  );
}

/**
 * One thing at home: its name, where its numbers come from (a small tag: BLS, Open Food Facts paired
 * with BLS or label only…), running low or used up in words, and how much is left.
 */
function Row({ item, look, left, onList, onEdit }: { item: PantryItem; look: HomeTileLook | undefined; left: Left; onList: boolean; onEdit: () => void }) {
  const d = useData();
  const amount = leftLabel(item, left);
  const status = left.out ? t('pantry.out') : left.low ? t('pantry.low') : '';
  return (
    <button className={`home-row${left.out ? ' out' : ''}`} onClick={onEdit}>
      <FoodIcon icon={look?.icon} monogram={look?.monogram ?? ''} size={36} kind={look?.kind} />
      <span className="shop-text">
        <span className="shop-name">{item.name}</span>
        <span className="small kitchen-meta">
          <FoodSourceTag foodRef={item.ref} product={item.ref && d.productsById.get(refKey(item.ref))} />
          {status && (
            <span className="home-status">
              {left.low && <Icon name="alert" size={14} />}
              {status}
              {onList && ` · ${t('pantry.onList')}`}
            </span>
          )}
        </span>
      </span>
      {amount && !left.out && <span className="shop-amount">{amount}</span>}
      <Icon name="chevron" size={16} />
    </button>
  );
}
