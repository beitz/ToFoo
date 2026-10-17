import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, formatDay } from '../../lib/dates';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CompactGauge, GaugeRow } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { statusLabel } from '../../ui/status';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import { rankFoods } from '../../model/ranking';
import { NON_SINGLE_FOOD_GROUPS } from '../../foods/foodDb';
import { diverseTop } from '../../foods/variety';
import { Field, Segmented, Sheet } from '../../ui/controls';
import type { NutrientResult } from '../../model/simulate';
import { Prompts } from './Prompts';
import { StockChips } from './StockChips';
import { attentionCounts, COLLAPSED_BY_DEFAULT, groupNutrients, type HomeGrouping } from './grouping';

/** Shown first, in one row: energy and the macronutrients. */
const MACRO_ROW = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];

/** Nutrients whose need or store scales with body weight. */
const PER_KG = new Set(['PROT625', 'HIS', 'ILE', 'LEU', 'LYS', 'SAA', 'AAA', 'THR', 'TRP', 'VAL']);

export function HomePage() {
  const d = useData();
  const toast = useToast();
  const { model, settings, today } = d;
  const [fastSheet, setFastSheet] = useState(false);
  const [fastStart, setFastStart] = useState(today);
  const [legendOpen, setLegendOpen] = useState(false);
  const showRange = isOn(settings.features, 'uncertaintyRanges');
  const hidden = new Set(settings.hiddenNutrients);
  const todayStatus = model.dayStatus[today];
  const todayEntries = d.log.filter((e) => e.day === today);

  const macros = MACRO_ROW.map((id) => (hidden.has(id) ? undefined : model.nutrients.get(id))).filter((r): r is NutrientResult => !!r);
  const grouping: HomeGrouping = settings.homeGrouping ?? 'status';
  const groups = useMemo(
    () =>
      groupNutrients(
        NUTRIENTS.filter((n) => !hidden.has(n.id) && !MACRO_ROW.includes(n.id))
          .map((n) => model.nutrients.get(n.id)!)
          .filter(Boolean),
        grouping,
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [model, settings.hiddenNutrients, grouping],
  );
  const isCollapsed = (key: string) => settings.homeCollapsed?.[key] ?? COLLAPSED_BY_DEFAULT.has(key);
  const toggleGroup = (key: string) => void repo.updateSettings({ homeCollapsed: { ...settings.homeCollapsed, [key]: !isCollapsed(key) } });

  const gaps = useMemo(() => {
    const excludedGroups = new Set(d.profile.exclusions.groups);
    const excludedFoods = new Set(d.profile.exclusions.foods);
    const candidates = d.foods.foods
      .filter((f) => !NON_SINGLE_FOOD_GROUPS.has(f.group) && !excludedGroups.has(f.group) && !excludedFoods.has(f.code))
      .map((f) => ({ key: f.code, per100: f.per100 }));
    const ranked = rankFoods(candidates, model.nutrients, d.requirements, 80);
    return diverseTop(ranked, 12, (g) => d.foods.byCode.get(g.key) ?? { code: g.key, nameEn: g.key });
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

  const statusText = todayEntries.length ? t('home.logToday', { n: todayEntries.length }) : todayStatus === 'fasted' ? t('day.fasted') : t('home.nothingYet');

  return (
    <section>
      <header className="page-head">
        <h1>{t('app.name')}</h1>
        <span className="muted">
          {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          {!d.activeFast && ` · ${statusText}`}
        </span>
      </header>
      {d.activeFast && (
        <p className="home-fasting">
          <Icon name="moon" size={16} /> {t('home.fastingSince', { day: formatDay(d.activeFast.startDay, today) })}
        </p>
      )}
      <StockChips />

      <Prompts />

      <div className="section-title home-gauges-head">
        <h2>{t('home.gauges')}</h2>
        <button
          className="icon-btn"
          aria-label={t('home.legendTitle')}
          aria-expanded={legendOpen}
          aria-controls="home-legend"
          onClick={() => setLegendOpen((o) => !o)}
        >
          <Icon name="info" />
        </button>
      </div>
      {legendOpen && (
        <p className="muted small home-legend" id="home-legend">
          {t('home.legend')}
        </p>
      )}
      {(weightDefault || sexDefault) && (
        <p className="muted small">
          {weightDefault ? '* ' : ''}
          {t('home.defaultsNote')}{' '}
          <a href={href('settings', 'profile')}>{t('home.addProfile')}</a>
        </p>
      )}
      {macros.length > 0 && (
        <div className="macro-row" role="group" aria-label={t('home.macros')}>
          {macros.map((r) => (
            <CompactGauge key={r.id} variant="cell" result={r} defaultBased={weightDefault && PER_KG.has(r.id)} onClick={() => navigate('nutrient', r.id)} />
          ))}
        </div>
      )}
      <Segmented
        label={t('home.grouping')}
        className="home-grouping"
        value={grouping}
        onChange={(v) => void repo.updateSettings({ homeGrouping: v })}
        options={[
          { value: 'status', label: t('home.groupStatus') },
          { value: 'type', label: t('home.groupType') },
          { value: 'none', label: t('home.groupNone') },
        ]}
      />
      {groups.map((g) => {
        const grid = (
          <div className="nrow-list" id={`group-${g.key}`}>
            {g.items.map((r) => {
              const defaultBased = weightDefault && (r.kind === 'tank' || r.kind === 'balance' || PER_KG.has(r.id));
              const open = () => navigate('nutrient', r.id);
              return <GaugeRow key={r.id} result={r} showRange={showRange} defaultBased={defaultBased} onClick={open} />;
            })}
          </div>
        );
        if (grouping === 'none') return <div key={g.key}>{grid}</div>;
        const collapsed = isCollapsed(g.key);
        const counts = grouping === 'type' ? attentionCounts(g.items) : [];
        // Status headings say what to do; type headings say how many need attention.
        const hint =
          grouping === 'status'
            ? ['tooHigh', 'low', 'gettingLow'].includes(g.id)
              ? t(`home.groupHint.${g.id}` as MessageKey)
              : ''
            : counts.length
              ? counts.map((c) => `${c.n} ${statusLabel(c.status).toLowerCase()}`).join(' · ')
              : t('home.groupAllFine');
        return (
          <div key={g.key} className={`home-group home-group-${g.id}`}>
            <button className="home-group-head" aria-expanded={!collapsed} aria-controls={`group-${g.key}`} onClick={() => toggleGroup(g.key)}>
              <span className={collapsed ? 'chev' : 'chev chev-open'} aria-hidden>
                <Icon name="chevron" size={16} />
              </span>
              <span className="home-group-title">
                {t(`home.group.${grouping}.${g.id}` as MessageKey)} <span className="home-group-count">{g.items.length}</span>
              </span>
              {hint && <span className="home-group-hint">{hint}</span>}
            </button>
            {!collapsed && grid}
          </div>
        );
      })}

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
      <div className="fab-stack">
        <button
          className={`fab fab-small${d.activeFast ? ' on' : ''}`}
          onClick={toggleFast}
          aria-pressed={!!d.activeFast}
          aria-label={d.activeFast ? t('home.endFast') : t('home.startFast')}
          title={d.activeFast ? t('home.endFast') : t('home.startFast')}
        >
          <Icon name="moon" />
        </button>
        <a className="fab" href={href('log')} aria-label={t('home.logMeal')} title={t('home.logMeal')}>
          <Icon name="plus" size={28} />
        </a>
      </div>
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
