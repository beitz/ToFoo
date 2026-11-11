import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { dayKey, formatDateTime, formatDay, formatTime, weekdayShort } from '../../lib/dates';
import { search } from '../../foods/search';
import type { Food } from '../../foods/foodDb';
import { repo } from '../../storage/repo';
import type { Batch, CustomFood, LogEntry, Product } from '../../storage/types';
import { needsCheck } from '../../foods/products';
import { UsdaResults } from './UsdaResults';
import { OffResults, useOffSearch } from './OffResults';
import { FoodList } from './FoodList';
import { EditEntrySheet } from '../diary/EditEntrySheet';
import { ProductList } from './ProductList';
import { Icon } from '../../ui/Icon';
import { isOn } from '../../settings/features';
import { PortionSheet } from './PortionSheet';
import { AmountSheet } from './AmountSheet';
import { BarcodeSheet } from './BarcodeSheet';
import { CustomSheet } from './CustomSheet';
import { ManualSheet } from './ManualSheet';
import { defaultTimeFor, fromLocalInput, toLocalInput } from './time';
import { DateTimeInput } from '../../ui/DateInputs';
import { entryAmount } from './describe';
import { logMealAgain } from './logAgain';
import { recentMeals } from '../../logic/repeat';
import { LogSection } from './LogSection';
import { FavouriteMealButton, useFavouriteMeals } from './FavouriteButton';
import { refKey } from '../../lib/refs';
import { WaterSheet } from '../water/WaterSheet';
import { HomeTiles, type HomeTile } from './HomeTiles';
import { useFoodTiles } from './useFoodTiles';
import { MealCards, MealSheet, MealStar, mealWhen, type MealCard } from './MealCards';
import { usePantry } from '../pantry/usePantry';
import { InfoButton } from '../../ui/InfoButton';
import type { FoodIconName } from '../../logic/foodIcons';
import { useHomeTiles, type HomePick } from './useHomeTiles';
import { BackButton } from '../../ui/BackButton';

type Selected =
  | { kind: 'food'; food: Food }
  | { kind: 'product'; product: Product }
  | { kind: 'barcode' }
  | { kind: 'custom'; food: CustomFood }
  | { kind: 'manual'; supplement: boolean }
  | { kind: 'portion'; batch: Batch }
  | null;

/** Recent meals offered: two rows of three cards at 360 px, enough to find the ones worth pinning. */
const RECENT_MEALS = 6;

/** Log a meal: search foods, pick amounts; several items in a row form one meal. Route: #/log[/day]. */
export function LogPage({ day: dayParam, foodCode }: { day?: string; foodCode?: string }) {
  const d = useData();
  const toast = useToast();
  const [addingWater, setAddingWater] = useState(false);
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : d.today;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selected>(() => {
    // A food page's "Log this food": a BLS food, or a scanned or USDA product.
    const product = foodCode ? d.productsById.get(foodCode) : undefined;
    if (product) return { kind: 'product', product };
    const food = foodCode ? d.foods.byCode.get(foodCode) : undefined;
    return food ? { kind: 'food', food } : null;
  });
  const [added, setAdded] = useState<string[]>([]);
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [mealTime, setMealTime] = useState(() => defaultTimeFor(day, d.today));

  const results = useMemo(
    () => (query.trim() ? search(d.searchIndex, query, { limit: 40, recent: d.recentFoods, boost: d.searchBoost }) : []),
    [query, d.searchIndex, d.recentFoods, d.searchBoost],
  );
  const customMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return d.customFoods.filter((c) => c.name.toLowerCase().includes(q));
  }, [query, d.customFoods]);
  const offOn = isOn(d.settings.features, 'openFoodFacts');
  const usdaOn = isOn(d.settings.features, 'usda');
  const productsToCheck = useMemo(() => d.products.filter(needsCheck).length, [d.products]);
  // Products looked up before stay on this phone and are found by name without any request.
  const productMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return d.products.filter((p) => `${p.name} ${p.brand ?? ''} ${p.code}`.toLowerCase().includes(q));
  }, [query, d.products]);
  // Products not on this phone yet, from the bundled Open Food Facts list.
  const offSearch = useOffSearch(query, offOn, results);
  const { meals: pinnedMeals, pinnedOf, toggle: toggleMeal, unpin: unpinMeal } = useFavouriteMeals();
  // The meal being logged right now is not a "recent meal" yet; one already pinned shows under Favourites.
  const pastMeals = useMemo(
    () =>
      recentMeals(added.length ? d.log.filter((e) => !added.includes(e.id)) : d.log, d.settings.mealWindowMinutes, d.batchesById, { limit: RECENT_MEALS + pinnedMeals.length })
        .filter((meal) => !pinnedOf(meal))
        .slice(0, RECENT_MEALS),
    // pinnedOf follows pinnedMeals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [d.log, added, d.settings.mealWindowMinutes, d.batchesById, pinnedMeals],
  );
  const favouriteCards: MealCard[] = pinnedMeals.map(({ fav, meal }) => ({ key: fav.id, meal, fav, when: meal.length === 1 ? entryAmount(meal[0]!, d) : t('log.items', { n: meal.length }) }));
  const recentCards: MealCard[] = pastMeals.map((meal) => ({ key: meal[0]!.id, meal, when: mealWhen(meal[0]!, d.today) }));
  const [mealOpen, setMealOpen] = useState<MealCard | null>(null);
  const addedEntries = added.map((id) => d.log.find((e) => e.id === id)).filter((e): e is LogEntry => !!e);
  /** A new meal time moves what this meal already has too: it is one meal. */
  async function changeMealTime(time: number) {
    setMealTime(time);
    for (const e of addedEntries) await repo.updateLog({ ...e, time, day: dayKey(new Date(time)) });
  }
  const atHomeOn = isOn(d.settings.features, 'atHome');
  const pickHome = useCallback((pick: HomePick) => setSelected(pick), []);
  const loggedHome = useCallback(
    (entry: LogEntry, message: string) => {
      setAdded((a) => [...a, entry.id]);
      setMealTime(entry.time);
      setQuery('');
      toast(message, () => {
        void repo.deleteLog(entry.id);
        setAdded((a) => a.filter((x) => x !== entry.id));
      });
    },
    [toast],
  );
  // Cooked pots and foods at home as tiles: one tap adds one, a hold opens the amount sheet.
  const homeTiles = useHomeTiles({ day, time: mealTime, query, added: addedEntries, onPick: pickHome, onLogged: loggedHome });
  // Favourites and recent foods as the same tiles; what is at home has its own tile already.
  const pantry = usePantry();
  const atHome = useMemo(() => new Set(atHomeOn ? (pantry ?? []).flatMap((p) => (p.ref ? [refKey(p.ref)] : [])) : []), [pantry, atHomeOn]);
  const foodTiles = useFoodTiles({ time: mealTime, query, added: addedEntries, skip: atHome, onPick: pickHome, onLogged: loggedHome });
  const [timeOpen, setTimeOpen] = useState(false);

  function onAdded(entry: LogEntry) {
    setAdded((a) => [...a, entry.id]);
    setMealTime(entry.time);
    setSelected(null);
    setQuery('');
    toast(t('log.added', { name: entry.label }), () => {
      void repo.deleteLog(entry.id);
      setAdded((a) => a.filter((x) => x !== entry.id));
    });
  }

  async function repeat(meal: LogEntry[]) {
    const entries = await logMealAgain(meal, mealTime, d.batchesById, toast);
    if (!entries.length) return;
    setAdded((a) => [...a, ...entries.map((e) => e.id)]);
    setMealTime(entries[entries.length - 1]!.time);
  }

  async function addDrink(drink: 'tea' | 'coffee') {
    const entry = await repo.addLog({ kind: 'drink', drink, time: mealTime, day, confidence: 'A', label: drink === 'tea' ? t('log.tea') : t('log.coffee') });
    onAdded(entry);
  }

  // Drinks and other entries as the same round tiles; nothing to hold for, so a hold taps.
  const quick = (key: string, name: string, onTap: () => void, look: { icon?: FoodIconName; picture?: ReactNode }): HomeTile => ({ key, short: name, full: name, detail: '', monogram: name.slice(0, 2), added: 0, onTap, ...look });
  const quickTiles: HomeTile[] = [
    quick('tea', t('log.tea'), () => void addDrink('tea'), { icon: 'teacup-without-handle' }),
    quick('coffee', t('log.coffee'), () => void addDrink('coffee'), { icon: 'hot-beverage' }),
    ...(isOn(d.settings.features, 'water') ? [quick('water', t('water.short'), () => setAddingWater(true), { icon: 'droplet' })] : []),
    quick('supplement', t('log.supplement'), () => setSelected({ kind: 'manual', supplement: true }), { picture: <Icon name="pill" size={26} /> }),
    quick('manual', t('log.manualShort'), () => setSelected({ kind: 'manual', supplement: false }), { picture: <Icon name="edit" size={26} /> }),
  ];

  return (
    <section>
      <header className="page-head row">
        <BackButton />
        <h1>{day === d.today ? t('log.title') : t('log.titleDay', { day: formatDay(day, d.today) })}</h1>
      </header>

      {/* Photo, meal time and search in one row (owner's ask, 2026-11-08); it stays at the top while scrolling. */}
      <div className="log-top-wrap">
        <div className="log-top">
          {isOn(d.settings.features, 'aiAssistant') && (
            <a className="icon-btn log-top-ai" href={href('assistant', day)} aria-label={t('ai.entry')} title={t('ai.entry')}>
              <Icon name="camera" />
            </a>
          )}
          <button type="button" className="chip log-time" aria-expanded={timeOpen} aria-controls="log-time-edit" aria-label={t('log.timeChip', { time: formatDateTime(mealTime, d.today) })} onClick={() => setTimeOpen((o) => !o)}>
            <Icon name="clock" size={16} /> {timeChipText(mealTime, d.today)}
          </button>
          <div className="search-box log-search">
            <Icon name="search" />
            {/* Not focused on open, so the keyboard stays closed until the search is tapped (owner's ask, 2026-11-08). */}
            <input type="search" placeholder={t('log.searchShort')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('log.searchPlaceholder')} />
            {offOn && (
              <button type="button" className="icon-btn search-scan" onClick={() => setSelected({ kind: 'barcode' })} aria-label={t('off.scan')} title={t('off.scan')}>
                <Icon name="barcode" />
              </button>
            )}
          </div>
        </div>
        {timeOpen && (
          <div id="log-time-edit" className="meal-time-edit">
            <label htmlFor="log-time-input">{t('log.mealAt')}</label>
            <div className="row">
              <DateTimeInput
                id="log-time-input"
                value={toLocalInput(mealTime)}
                onChange={(e) => {
                  const v = fromLocalInput(e.target.value);
                  if (v !== undefined) void changeMealTime(v);
                }}
              />
              <button type="button" className="btn btn-secondary" onClick={() => setTimeOpen(false)}>
                {t('log.done')}
              </button>
            </div>
          </div>
        )}
      </div>

      {addedEntries.length > 0 && (
        <div className="card meal-so-far">
          <strong>{t('log.thisMeal')}</strong>
          <ul className="plain-list">
            {addedEntries.map((e) => (
              <li key={e.id}>
                <button className="entry-row" onClick={() => setEditing(e)}>
                  <span className="entry-label">{e.label}</span>
                  <span className="muted small">{entryAmount(e, d)}</span>
                  <span className="entry-edit">
                    <Icon name="edit" size={16} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="row wrap">
            <button className="btn btn-primary" onClick={() => navigate()}>
              {t('log.done')}
            </button>
            <FavouriteMealButton meal={addedEntries} />
          </div>
        </div>
      )}

      {!query.trim() && (
        <>
          <LogSection id="favourites" title={t('log.favourites')} count={favouriteCards.length + foodTiles.favourites.length} icon={<Icon name="star" size={16} filled />}>
            {favouriteCards.length + foodTiles.favourites.length === 0 ? (
              <p className="muted small">{t('log.favouritesEmpty')}</p>
            ) : (
              <>
                {favouriteCards.length > 0 && <MealCards cards={favouriteCards} onRepeat={(meal) => void repeat(meal)} onHold={setMealOpen} />}
                {foodTiles.favourites.length > 0 && <HomeTiles tiles={foodTiles.favourites} hintId="log-tiles-hint" />}
              </>
            )}
          </LogSection>

          {homeTiles.length > 0 && (
            <LogSection id="stock" title={t(atHomeOn ? 'log.atHome' : 'stock.title')} count={homeTiles.length}>
              <HomeTiles tiles={homeTiles} hintId="log-tiles-hint" grouped />
            </LogSection>
          )}

          {recentCards.length > 0 && (
            <LogSection id="recentMeals" title={t('log.recentMeals')} count={recentCards.length}>
              <MealCards cards={recentCards} onRepeat={(meal) => void repeat(meal)} onHold={setMealOpen} />
            </LogSection>
          )}

          {foodTiles.recent.length > 0 && (
            <LogSection id="recentFoods" title={t('log.recentFoods')} count={foodTiles.recent.length}>
              <HomeTiles tiles={foodTiles.recent} hintId="log-tiles-hint" />
            </LogSection>
          )}

          <LogSection id="quickAdd" title={t('log.quickAdd')} aside={<InfoButton title={t('log.drinksInfo')}><p>{t('log.drinksHint')}</p></InfoButton>}>
            <HomeTiles tiles={quickTiles} />
          </LogSection>
          {addingWater && <WaterSheet defaultTime={mealTime} onClose={() => setAddingWater(false)} />}

          <p id="log-tiles-hint" className="muted small home-tiles-hint">
            {t('log.tilesHint')}
          </p>
          <p id="log-meals-hint" hidden>
            {t('log.mealsHint')}
          </p>
          {(atHomeOn || productsToCheck > 0) && (
            <p className="row wrap log-links">
              {atHomeOn && (
                <a className="small log-home-link" href={href('kitchen')}>
                  {t('pantry.openPage')}
                </a>
              )}
              {productsToCheck > 0 && (
                <a className="small log-home-link" href={href('settings', 'products')}>
                  {t('match.toCheckLink', { n: productsToCheck })}
                </a>
              )}
            </p>
          )}
        </>
      )}

      {query.trim() && (
        <>
          {/* Your own things that match, as tiles above the results: above the keyboard when it is open. */}
          {homeTiles.length > 0 && (
            <div className="log-home-matches">
              <h2 className="small muted">{t(atHomeOn ? 'log.atHome' : 'stock.title')}</h2>
              <HomeTiles tiles={homeTiles} hintId="log-tiles-hint" grouped />
            </div>
          )}
          {foodTiles.favourites.length + foodTiles.recent.length > 0 && (
            <div className="log-home-matches">
              <h2 className="small muted">{t('log.yours')}</h2>
              <HomeTiles tiles={[...foodTiles.favourites, ...foodTiles.recent]} hintId="log-tiles-hint" />
            </div>
          )}
          {homeTiles.length + foodTiles.favourites.length + foodTiles.recent.length > 0 && (
            <p id="log-tiles-hint" className="muted small home-tiles-hint">
              {t('log.tilesHint')}
            </p>
          )}
          {customMatches.length > 0 && (
            <ul className="result-list">
              {customMatches.map((c) => (
                <li key={c.id}>
                  <button className="result" onClick={() => setSelected({ kind: 'custom', food: c })}>
                    <span className="result-name">{c.name}</span>
                    <span className="muted small">{c.isSupplement ? t('log.supplement') : t('log.savedItem')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {productMatches.length > 0 && <ProductList pinnable products={productMatches} onPick={(product) => setSelected({ kind: 'product', product })} />}
          {/* Keys name the list: two siblings keyed by the same query made old lists pile up (owner's report, 2026-10-23). */}
          {!offSearch.genericFirst && <OffResults key={`off:${query.trim()}`} search={offSearch} onPick={(product) => setSelected({ kind: 'product', product })} />}
          <FoodList foods={results.map((r) => d.foods.byCode.get(r.key)!).filter(Boolean)} onPick={(food) => setSelected({ kind: 'food', food })} />
          {offSearch.genericFirst && <OffResults key={`off:${query.trim()}`} search={offSearch} onPick={(product) => setSelected({ kind: 'product', product })} />}
          {results.length === 0 && customMatches.length === 0 && productMatches.length === 0 && offSearch.hits.length === 0 && offSearch.status !== 'loading' && (
            <div className="empty">
              <p>{t(offOn ? 'off.noResults' : 'log.noResults')}</p>
              <div className="row wrap">
                {offOn && (
                  <button className="btn btn-secondary" onClick={() => setSelected({ kind: 'barcode' })}>
                    <Icon name="barcode" /> {t('off.scan')}
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setSelected({ kind: 'manual', supplement: false })}>
                  {t('log.manual')}
                </button>
              </div>
            </div>
          )}
          {usdaOn && <UsdaResults key={`usda:${query.trim()}`} query={query.trim()} onPick={(product) => setSelected({ kind: 'product', product })} />}
        </>
      )}

      {selected?.kind === 'food' && <AmountSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'product' && <AmountSheet product={selected.product} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'barcode' && (
        <BarcodeSheet onFound={(product) => setSelected({ kind: 'product', product })} onManual={() => setSelected({ kind: 'manual', supplement: false })} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'portion' && <PortionSheet batch={selected.batch} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'custom' && <CustomSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {mealOpen && (
        <MealSheet
          title={mealOpen.fav ? t('log.favMeal') : t('log.pastMeal', { when: mealOpen.when })}
          meal={mealOpen.meal}
          time={mealTime}
          onLog={(picked) => {
            setMealOpen(null);
            void repeat(picked);
          }}
          onClose={() => setMealOpen(null)}
          actions={
            <MealStar
              pinned={!!mealOpen.fav || !!pinnedOf(mealOpen.meal)}
              onToggle={() => {
                if (mealOpen.fav) unpinMeal(mealOpen.fav);
                else toggleMeal(mealOpen.meal);
                setMealOpen(null);
              }}
            />
          }
        />
      )}
      {selected?.kind === 'manual' && <ManualSheet supplement={selected.supplement} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
    </section>
  );
}

/** The meal's time on its chip: "10:00" today, "Sat 19:30" on another day. */
function timeChipText(time: number, today: string): string {
  const key = dayKey(new Date(time));
  return key === today ? formatTime(time) : `${weekdayShort(key)} ${formatTime(time)}`;
}
