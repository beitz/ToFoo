import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { formatDay, formatTime } from '../../lib/dates';
import { search } from '../../foods/search';
import type { Food } from '../../foods/foodDb';
import { repo } from '../../storage/repo';
import type { CustomFood, LogEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { nextStorage, totalLeft, logPortion } from '../home/StockChips';
import { AmountSheet } from './AmountSheet';
import { CustomSheet } from './CustomSheet';
import { ManualSheet } from './ManualSheet';
import { defaultTimeFor } from './time';
import { entryAmount } from './describe';

type Selected = { kind: 'food'; food: Food } | { kind: 'custom'; food: CustomFood } | { kind: 'manual'; supplement: boolean } | null;

/** Log a meal: search foods, pick amounts; several items in a row form one meal. Route: #/log[/day]. */
export function LogPage({ day: dayParam, foodCode }: { day?: string; foodCode?: string }) {
  const d = useData();
  const toast = useToast();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : d.today;
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Selected>(() => {
    const food = foodCode ? d.foods.byCode.get(foodCode) : undefined;
    return food ? { kind: 'food', food } : null;
  });
  const [added, setAdded] = useState<string[]>([]);
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
  const recent = useMemo(() => [...d.recentFoods.entries()].filter(([, v]) => v > 0.3).slice(0, 8).map(([code]) => d.foods.byCode.get(code)).filter((f): f is Food => !!f), [d.recentFoods, d.foods]);
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
              <li key={e.id} className="row-between">
                <span>{e.label}</span>
                <span className="muted small">{entryAmount(e, d)}</span>
              </li>
            ))}
          </ul>
          <button className="btn btn-primary" onClick={() => navigate()}>
            {t('log.done')}
          </button>
        </div>
      )}

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

      {!query.trim() && (
        <>
          {stock.length > 0 && (
            <>
              <h2 className="section-title">{t('stock.title')}</h2>
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
            </>
          )}

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
          </div>
          <p className="muted small">{t('log.drinksHint')}</p>

          {d.customFoods.length > 0 && (
            <>
              <h2 className="section-title">{t('log.saved')}</h2>
              <ul className="result-list">
                {d.customFoods.map((c) => (
                  <li key={c.id}>
                    <button className="result" onClick={() => setSelected({ kind: 'custom', food: c })}>
                      <span className="result-name">
                        {c.isSupplement && <Icon name="pill" size={14} />} {c.name}
                      </span>
                      <span className="muted small">{c.servingLabel}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}

          {recent.length > 0 && (
            <>
              <h2 className="section-title">{t('log.recent')}</h2>
              <FoodList foods={recent} onPick={(food) => setSelected({ kind: 'food', food })} />
            </>
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
          <FoodList foods={results.map((r) => d.foods.byCode.get(r.key)!).filter(Boolean)} onPick={(food) => setSelected({ kind: 'food', food })} />
          {results.length === 0 && customMatches.length === 0 && (
            <div className="empty">
              <p>{t('log.noResults')}</p>
              <button className="btn btn-secondary" onClick={() => setSelected({ kind: 'manual', supplement: false })}>
                {t('log.manual')}
              </button>
            </div>
          )}
        </>
      )}

      {selected?.kind === 'food' && <AmountSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'custom' && <CustomSheet food={selected.food} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
      {selected?.kind === 'manual' && <ManualSheet supplement={selected.supplement} day={day} time={mealTime} onClose={() => setSelected(null)} onAdded={onAdded} />}
    </section>
  );
}

export function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const d = useData();
  return (
    <ul className="result-list">
      {foods.map((f) => (
        <li key={f.code}>
          <button className="result" onClick={() => onPick(f)}>
            <span className="result-name">{f.nameEn}</span>
            <span className="muted small">
              {f.nameDe} · {d.foods.groups[f.group]?.en}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
