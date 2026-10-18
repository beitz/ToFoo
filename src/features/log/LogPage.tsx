import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { search } from '../../foods/search';
import type { Food } from '../../foods/foodDb';
import { repo } from '../../storage/repo';
import type { CustomFood, FavouriteMeal, FoodRef, LogEntry, Product } from '../../storage/types';
import { productLabel } from '../../foods/products';
import { UsdaResults } from './UsdaResults';
import { FoodList } from './FoodList';
import { EditEntrySheet } from '../diary/EditEntrySheet';
import { ProductList, productTag } from './ProductList';
import { Icon } from '../../ui/Icon';
import { isOn } from '../../settings/features';
import { nextStorage, totalLeft, logPortion } from '../home/StockChips';
import { AmountSheet } from './AmountSheet';
import { BarcodeSheet } from './BarcodeSheet';
import { CustomSheet } from './CustomSheet';
import { ManualSheet } from './ManualSheet';
import { defaultTimeFor } from './time';
import { entryAmount } from './describe';
import { logMealAgain, mealTitle } from './logAgain';
import { favouriteAsMeal, favouriteFromMeal, mealSignature, recentMeals } from '../../logic/repeat';
import { newId } from '../../lib/id';
import { LogSection } from './LogSection';
import { FavouriteStar } from './FavouriteButton';
import { refKey } from '../../lib/refs';
import { WaterSheet } from '../water/WaterSheet';

type Selected =
  | { kind: 'food'; food: Food }
  | { kind: 'product'; product: Product }
  | { kind: 'barcode' }
  | { kind: 'custom'; food: CustomFood }
  | { kind: 'manual'; supplement: boolean }
  | null;

/** Saved products shown under "Packaged products" when nothing is searched. */
const RECENT_PRODUCTS = 6;
/** Recent meals offered; enough to find the ones worth pinning as favourites. */
const RECENT_MEALS = 5;

/** Log a meal: search foods, pick amounts; several items in a row form one meal. Route: #/log[/day]. */
export function LogPage({ day: dayParam, foodCode }: { day?: string; foodCode?: string }) {
  const d = useData();
  const toast = useToast();
  const [addingWater, setAddingWater] = useState(false);
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : d.today;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selected>(() => {
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
  // Products looked up before stay on this phone and are found by name without any request.
  const productMatches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return d.products.filter((p) => `${p.name} ${p.brand ?? ''} ${p.code}`.toLowerCase().includes(q));
  }, [query, d.products]);
  const favourites = useMemo(() => {
    const out: Array<{ key: string; ref: FoodRef; pick: Selected; name: string; detail: string }> = [];
    for (const ref of d.settings.favourites ?? []) {
      if (ref.source === 'BLS') {
        const food = d.foods.byCode.get(ref.code);
        if (food) out.push({ key: refKey(ref), ref, pick: { kind: 'food', food }, name: food.nameEn, detail: food.nameDe });
      } else if (ref.source === 'OFF' || ref.source === 'USDA') {
        const product = d.productsById.get(refKey(ref));
        if (product) out.push({ key: refKey(ref), ref, pick: { kind: 'product', product }, name: productLabel(product), detail: productTag(product) });
      } else if (ref.source === 'custom') {
        const food = d.customFoodsById.get(ref.id);
        if (food) out.push({ key: refKey(ref), ref, pick: { kind: 'custom', food }, name: food.name, detail: food.servingLabel });
      }
    }
    return out;
  }, [d.settings.favourites, d.foods, d.productsById, d.customFoodsById]);
  const favouriteMeals = useMemo(
    () =>
      (d.settings.favouriteMeals ?? []).map((fav) => {
        const meal = favouriteAsMeal(fav);
        return { fav, meal, title: mealTitle(meal) };
      }),
    [d.settings.favouriteMeals],
  );
  const favouriteBySignature = useMemo(
    () => new Map(favouriteMeals.map(({ fav, meal }) => [mealSignature(meal, d.batchesById), fav])),
    [favouriteMeals, d.batchesById],
  );
  const recent = useMemo(() => {
    const pinned = new Set(favourites.map((f) => f.key));
    return [...d.recentFoods.entries()]
      .filter(([code, v]) => v > 0.3 && !pinned.has(`BLS:${code}`))
      .slice(0, 8)
      .map(([code]) => d.foods.byCode.get(code))
      .filter((f): f is Food => !!f);
  }, [d.recentFoods, d.foods, favourites]);
  // The meal being logged right now is not a "recent meal" yet.
  const pastMeals = useMemo(
    () => recentMeals(added.length ? d.log.filter((e) => !added.includes(e.id)) : d.log, d.settings.mealWindowMinutes, d.batchesById, { limit: RECENT_MEALS }),
    [d.log, added, d.settings.mealWindowMinutes, d.batchesById],
  );
  const addedEntries = added.map((id) => d.log.find((e) => e.id === id)).filter((e): e is LogEntry => !!e);
  const stock = d.batches.filter((b) => totalLeft(b) > 0);

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

  /** Pin a meal, or unpin it when the same items in the same amounts are already pinned. */
  function toggleMeal(meal: readonly LogEntry[]) {
    const pinned = favouriteBySignature.get(mealSignature(meal, d.batchesById));
    if (pinned) return unpinMeal(pinned);
    const fav = favouriteFromMeal(meal, newId());
    void repo.addFavouriteMeal(fav);
    toast(t('fav.mealPinned'), () => void repo.removeFavouriteMeal(fav.id));
  }

  function unpinMeal(fav: FavouriteMeal) {
    const index = (d.settings.favouriteMeals ?? []).findIndex((m) => m.id === fav.id);
    void repo.removeFavouriteMeal(fav.id);
    toast(t('fav.mealRemoved'), () => void repo.addFavouriteMeal(fav, index));
  }

  function unpinFood(ref: FoodRef, name: string) {
    void repo.toggleFavourite(ref);
    toast(t('fav.removed', { name }), () => void repo.toggleFavourite(ref));
  }

  async function addDrink(drink: 'tea' | 'coffee') {
    const entry = await repo.addLog({ kind: 'drink', drink, time: mealTime, day, confidence: 'A', label: drink === 'tea' ? t('log.tea') : t('log.coffee') });
    onAdded(entry);
  }

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={href()} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{day === d.today ? t('log.title') : t('log.titleDay', { day: formatDay(day, d.today) })}</h1>
      </header>

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
            {(() => {
              const pinned = favouriteBySignature.has(mealSignature(addedEntries, d.batchesById));
              return (
                <button className={`btn btn-small btn-ghost fav-btn${pinned ? ' on' : ''}`} aria-pressed={pinned} onClick={() => toggleMeal(addedEntries)}>
                  <Icon name="star" size={18} filled={pinned} /> {t(pinned ? 'fav.mealOn' : 'fav.saveMeal')}
                </button>
              );
            })()}
          </div>
        </div>
      )}

      {isOn(d.settings.features, 'aiAssistant') && (
        <a className="btn btn-primary btn-block assistant-entry" href={dayParam ? href('assistant', day) : href('assistant')}>
          <Icon name="camera" /> {t('ai.entry')}
        </a>
      )}

      <div className="search-row">
        <div className="search-box">
          <Icon name="search" />
          <input
            type="search"
            autoFocus
            placeholder={t('log.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t('log.searchPlaceholder')}
          />
        </div>
        {offOn && (
          <button className="icon-btn scan-btn" onClick={() => setSelected({ kind: 'barcode' })} aria-label={t('off.scan')} title={t('off.scan')}>
            <Icon name="barcode" />
          </button>
        )}
      </div>

      {!query.trim() && (
        <>
          <LogSection id="favourites" title={t('log.favourites')} count={favouriteMeals.length + favourites.length} icon={<Icon name="star" size={16} filled />}>
            {favouriteMeals.length + favourites.length === 0 ? (
              <p className="muted small">{t('log.favouritesEmpty')}</p>
            ) : (
              <ul className="result-list">
                {favouriteMeals.map(({ fav, meal, title }) => (
                  <li key={fav.id} className="fav-row">
                    <button className="result" onClick={() => void repeat(meal)}>
                      <span className="result-name">
                        <Icon name="repeat" size={16} /> {title}
                      </span>
                      <span className="muted small">{meal.length === 1 ? entryAmount(meal[0]!, d) : t('log.favMealDetail', { n: meal.length })}</span>
                    </button>
                    <button className="icon-btn fav-star on" aria-pressed aria-label={t('fav.unpinMeal', { name: title })} onClick={() => unpinMeal(fav)}>
                      <Icon name="star" filled />
                    </button>
                  </li>
                ))}
                {favourites.map((f) => (
                  <li key={f.key} className="fav-row">
                    <button className="result" onClick={() => setSelected(f.pick)}>
                      <span className="result-name">{f.name}</span>
                      <span className="muted small">{f.detail}</span>
                    </button>
                    <button className="icon-btn fav-star on" aria-pressed aria-label={t('fav.unpin', { name: f.name })} onClick={() => unpinFood(f.ref, f.name)}>
                      <Icon name="star" filled />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </LogSection>

          {stock.length > 0 && (
            <LogSection id="stock" title={t('stock.title')} count={stock.length}>
              <div className="chips">
                {stock.map((b) => {
                  const s = nextStorage(b, day);
                  return (
                    <button
                      key={b.id}
                      className="chip"
                      disabled={!s}
                      onClick={async () => {
                        if (!s) return;
                        await logPortion(b, s, toast, mealTime);
                        navigate();
                      }}
                    >
                      <Icon name={s === 'freezer' ? 'snow' : s === 'fridge' ? 'fridge' : 'pot'} size={16} />
                      {b.recipe.name} · {t('stock.left', { n: totalLeft(b) })}
                    </button>
                  );
                })}
              </div>
            </LogSection>
          )}

          {pastMeals.length > 0 && (
            <LogSection id="recentMeals" title={t('log.recentMeals')} count={pastMeals.length}>
              <ul className="result-list">
                {pastMeals.map((meal) => {
                  const title = mealTitle(meal);
                  const pinned = favouriteBySignature.has(mealSignature(meal, d.batchesById));
                  return (
                    <li key={meal[0]!.id} className="fav-row">
                      <button className="result" onClick={() => void repeat(meal)}>
                        <span className="result-name">
                          <Icon name="repeat" size={16} /> {title}
                        </span>
                        <span className="muted small">
                          {formatDay(meal[0]!.day, d.today)} · {formatTime(meal[0]!.time)}
                        </span>
                      </button>
                      <button
                        className={`icon-btn fav-star${pinned ? ' on' : ''}`}
                        aria-pressed={pinned}
                        aria-label={t(pinned ? 'fav.unpinMeal' : 'fav.pinMeal', { name: title })}
                        onClick={() => toggleMeal(meal)}
                      >
                        <Icon name="star" filled={pinned} />
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="muted small">{t('log.recentMealsHint')}</p>
            </LogSection>
          )}

          {recent.length > 0 && (
            <LogSection id="recentFoods" title={t('log.recentFoods')} count={recent.length}>
              <FoodList foods={recent} onPick={(food) => setSelected({ kind: 'food', food })} />
            </LogSection>
          )}


          <LogSection id="quickAdd" title={t('log.quickAdd')}>
            <div className="quick-actions">
              <button className="btn btn-secondary" onClick={() => setSelected({ kind: 'manual', supplement: false })}>
                <Icon name="edit" /> {t('log.manual')}
              </button>
              <button className="btn btn-secondary" onClick={() => setSelected({ kind: 'manual', supplement: true })}>
                <Icon name="pill" /> {t('log.supplement')}
              </button>
              <button className="btn btn-secondary" onClick={() => void addDrink('tea')}>
                <Icon name="cup" /> {t('log.tea')}
              </button>
              <button className="btn btn-secondary" onClick={() => void addDrink('coffee')}>
                <Icon name="cup" /> {t('log.coffee')}
              </button>
              {isOn(d.settings.features, 'water') && (
                <button className="btn btn-secondary" onClick={() => setAddingWater(true)}>
                  <Icon name="drop" /> {t('water.short')}
                </button>
              )}
            </div>
            <p className="muted small">{t('log.drinksHint')}</p>
          </LogSection>
          {addingWater && <WaterSheet defaultTime={mealTime} onClose={() => setAddingWater(false)} />}

          {d.customFoods.length > 0 && (
            <LogSection id="saved" title={t('log.saved')} count={d.customFoods.length}>
              <ul className="result-list">
                {d.customFoods.map((c) => (
                  <li key={c.id} className="fav-row">
                    <button className="result" onClick={() => setSelected({ kind: 'custom', food: c })}>
                      <span className="result-name">
                        {c.isSupplement && <Icon name="pill" size={14} />} {c.name}
                      </span>
                      <span className="muted small">{c.servingLabel}</span>
                    </button>
                    <FavouriteStar foodRef={{ source: 'custom', id: c.id }} name={c.name} />
                  </li>
                ))}
              </ul>
            </LogSection>
          )}

          {(offOn || usdaOn) && d.products.length > 0 && (
            <LogSection id="products" title={t(usdaOn ? 'products.saved' : 'off.products')}>
              <ProductList pinnable products={d.products.slice(0, RECENT_PRODUCTS)} onPick={(product) => setSelected({ kind: 'product', product })} />
            </LogSection>
          )}

          <p className="muted small">{t('log.timeNote', { time: formatTime(mealTime) })}</p>
        </>
      )}

      {query.trim() && (
        <>
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
          <FoodList foods={results.map((r) => d.foods.byCode.get(r.key)!).filter(Boolean)} onPick={(food) => setSelected({ kind: 'food', food })} />
          {results.length === 0 && customMatches.length === 0 && productMatches.length === 0 && (
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
          {usdaOn && <UsdaResults key={query.trim()} query={query.trim()} onPick={(product) => setSelected({ kind: 'product', product })} />}
        </>
      )}

      {selected?.kind === 'food' && <AmountSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'product' && <AmountSheet product={selected.product} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'barcode' && (
        <BarcodeSheet onFound={(product) => setSelected({ kind: 'product', product })} onManual={() => setSelected({ kind: 'manual', supplement: false })} onClose={() => setSelected(null)} />
      )}
      {selected?.kind === 'custom' && <CustomSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {selected?.kind === 'manual' && <ManualSheet supplement={selected.supplement} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
    </section>
  );
}
