import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { addDays, formatDay } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Gauge } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { urgencyRank } from '../../ui/status';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { Field, Sheet } from '../../ui/controls';
import { Prompts } from './Prompts';
import { StockChips } from './StockChips';

/** Nutrients whose need or store scales with body weight. */
const PER_KG = new Set(['PROT625', 'HIS', 'ILE', 'LEU', 'LYS', 'SAA', 'AAA', 'THR', 'TRP', 'VAL']);

export function HomePage() {
  const d = useData();
  const toast = useToast();
  const { model, settings, today } = d;
  const [fastSheet, setFastSheet] = useState(false);
  const [fastStart, setFastStart] = useState(today);
  const showRange = isOn(settings.features, 'uncertaintyRanges');
  const advanced = isOn(settings.features, 'advancedNumbers');
  const hidden = new Set(settings.hiddenNutrients);
  const todayStatus = model.dayStatus[today];
  const todayEntries = d.log.filter((e) => e.day === today);

  const gauges = useMemo(
    () =>
      NUTRIENTS.filter((n) => !hidden.has(n.id))
        .map((n) => model.nutrients.get(n.id)!)
        .filter(Boolean)
        .sort((a, b) => urgencyRank(a.status) - urgencyRank(b.status) || (b.status === 'tooHigh' ? (b.ulRatio ?? b.value.central) - (a.ulRatio ?? a.value.central) : a.value.central - b.value.central)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, settings.hiddenNutrients],
  );

  const gaps = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const candidates = d.foods.foods
      .filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code))
      .map((f) => ({ key: f.code, per100: f.per100 }));
    return rankFoods(candidates, model.nutrients, d.requirements, 12);
  }, [d.foods, d.profile.exclusions, model, d.requirements]);

  const weightDefault = d.requirements.defaultsUsed.includes('weight');
  const sexDefault = d.requirements.defaultsUsed.includes('sex');

  async function toggleFast() {
    if (d.activeFast) {
      const f = d.activeFast;
      await repo.endFast(f.id, addDays(today, -1) < f.startDay ? f.startDay : addDays(today, -1));
      toast(t('home.fastEnded'), () => void repo.db.fasts.put(f));
    } else {
      setFastStart(today);
      setFastSheet(true);
    }
  }

  async function startFast() {
    const f = await repo.startFast(fastStart <= today ? fastStart : today);
    setFastSheet(false);
    toast(t('home.fastStarted'), () => repo.deleteFast(f.id));
  }

  const statusText = d.activeFast
    ? t('home.fastingSince', { day: formatDay(d.activeFast.startDay, today) })
    : todayEntries.length
      ? t('home.entriesToday', { n: todayEntries.length })
      : todayStatus === 'fasted'
        ? t('day.fasted')
        : t('home.nothingYet');

  return (
    <section>
      <header className="page-head">
        <h1>{t('app.name')}</h1>
        <span className="muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
      </header>

      <div className="card today">
        <div className="today-status">
          <span className="muted small">{t('home.today')}</span>
          <strong>{statusText}</strong>
        </div>
        <div className="today-actions">
          <a className="btn btn-primary btn-big" href={href('log')}>
            <Icon name="plus" /> {t('home.logMeal')}
          </a>
          <button className={`btn btn-secondary${d.activeFast ? ' on' : ''}`} onClick={toggleFast} aria-pressed={!!d.activeFast}>
            <Icon name="moon" /> {d.activeFast ? t('home.endFast') : t('home.fasting')}
          </button>
        </div>
        <StockChips />
      </div>

      <Prompts />

      <h2 className="section-title">{t('home.gauges')}</h2>
      {(weightDefault || sexDefault) && (
        <p className="muted small">
          {weightDefault ? '* ' : ''}
          {t('home.defaultsNote')}{' '}
          <a href={href('settings', 'profile')}>{t('home.addProfile')}</a>
        </p>
      )}
      <div className="gauge-grid">
        {gauges.map((r) => (
          <Gauge
            key={r.id}
            result={r}
            showRange={showRange}
            advanced={advanced}
            defaultBased={weightDefault && (r.kind === 'tank' || PER_KG.has(r.id))}
            onClick={() => navigate('nutrient', r.id)}
          />
        ))}
      </div>

      <h2 className="section-title">{t('home.gaps')}</h2>
      {gaps.length === 0 ? (
        <p className="muted">{t('home.noGaps')}</p>
      ) : (
        <div className="hscroll" role="list">
          {gaps.map((g) => {
            const food = d.foods.byCode.get(g.key)!;
            return (
              <a key={g.key} role="listitem" className="food-card" href={href('food', g.key)}>
                <strong className="food-card-name">{food.nameEn}</strong>
                <span className="muted small">{food.nameDe}</span>
                <span className="food-card-helps small">
                  {g.helps
                    .slice(0, 3)
                    .map((h) => NUTRIENT_BY_ID.get(h.id)?.short ?? h.id)
                    .join(' · ')}
                </span>
                <span className="muted small">{t('home.perPortion', { g: Math.round(g.grams) })}</span>
              </a>
            );
          })}
        </div>
      )}
      <p className="muted small disclaimer">{t('home.disclaimer')}</p>
      {fastSheet && (
        <Sheet title={t('home.fasting')} onClose={() => setFastSheet(false)}>
          <Field label={t('home.fastSince')} hint={t('home.fastHint')}>
            {(id) => <input id={id} type="date" value={fastStart} max={today} onChange={(e) => e.target.value && setFastStart(e.target.value)} />}
          </Field>
          <div className="sheet-actions">
            <button className="btn btn-primary" onClick={() => void startFast()}>
              {t('home.startFast')}
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
