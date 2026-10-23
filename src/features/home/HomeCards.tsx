import { useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { storeSources, todaySources, weekSources, type HomeSource } from '../../i18n/homeInfo.en';
import { fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { NutrientResult, StoreResult } from '../../model/simulate';
import { CompactGauge, StoreCompactGauge, windowTag } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { urgencyRank } from '../../ui/status';
import { viewsOf } from '../../settings/views';
import { NutrientsSection } from './NutrientsSection';
import { StoresSection } from './StoresSection';
import { MacroRings, useToday } from './TodayRings';

/** Energy and the macronutrients, today's amounts in five cells at the top (the bars view). */
const TODAY_CELLS = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];
/** The cells' bars run to 150 %, so the target sits two thirds along, as in every list bar. */
const SCALE = 1.5;

const byUrgency = (a: NutrientResult, b: NutrientResult) => urgencyRank(a.status) - urgencyRank(b.status) || a.value.central - b.value.central;

/**
 * Home's three cards, named by how long each number is averaged over (owner, 2026-10-23), each heading
 * with an ⓘ that says why: today so far, the last 7 days, and the body stores. How they look follows
 * Settings → Appearance: energy and macros as rings or bars, nutrients as comets or bars (the stores
 * then as tanks or rows).
 */
export function HomeCards({
  rest,
  stores,
  windowDays,
  startLevel,
  showRange,
  defaultBased,
}: {
  rest: NutrientResult[];
  stores: Array<NutrientResult & { store: StoreResult }>;
  windowDays: number;
  startLevel: string;
  showRange: boolean;
  defaultBased: (id: string) => boolean;
}) {
  const { settings, modelDays } = useData();
  const views = viewsOf(settings);
  // Finished days so far (today joins once it is over): while fewer than the window, the heading says so.
  const daysSoFar = modelDays.length - 1;
  const tagged = rest.some((r) => windowTag(r, windowDays));
  const title = daysSoFar > 0 && daysSoFar < windowDays ? t('home.firstDays', { n: daysSoFar }) : t('home.lastDays', { n: windowDays });
  const today = useToday();
  const go = (id: string) => () => navigate('nutrient', id);
  const sortedStores = [...stores].sort((a, b) => urgencyRank(a.store.status) - urgencyRank(b.store.status) || a.store.fill.central - b.store.fill.central);
  const comets = views.nutrients === 'comets';
  return (
    <>
      <ListCard id="today" tour="home.today" title={t('home.today')} note={t('home.todayNote')} info={t('home.todayInfo')} sources={todaySources(t)}>
        {views.macros === 'rings' ? <MacroRings values={today} defaultBased={defaultBased} today /> : <TodayCells defaultBased={defaultBased} />}
      </ListCard>
      {rest.length > 0 && (
        <ListCard id="week" tour="home.week" title={title} note={t('home.weekNote')} info={`${t('home.weekInfo', { n: windowDays })}${comets ? ` ${t('home.cometLegend')}` : ''}`} sources={weekSources(t)}>
          {comets ? (
            <NutrientsSection results={rest} showRange={showRange} />
          ) : (
            <div className="cgauge-grid">
              {[...rest].sort(byUrgency).map((r) => (
                <CompactGauge key={r.id} result={r} onClick={go(r.id)} usualWindow={windowDays} reserveWindow={tagged} />
              ))}
            </div>
          )}
        </ListCard>
      )}
      {stores.length > 0 && (
        <ListCard id="stores" tour="home.stores" title={t('home.stores')} note={t('home.storesListNote')} info={t('home.storesInfo', { start: t(`start.${startLevel}` as MessageKey) })} sources={storeSources(t)}>
          {comets ? (
            <StoresSection stores={stores} showRange={showRange} />
          ) : (
            <div className="cgauge-grid">
              {sortedStores.map((r) => (
                <StoreCompactGauge key={r.id} result={r} onClick={go(r.id)} />
              ))}
            </div>
          )}
        </ListCard>
      )}
    </>
  );
}

/** A card with its heading, a short note on what the numbers are, and an ⓘ that opens why, with the sources to check it. */
function ListCard({ id, tour, title, note, info, sources, children }: { id: string; tour: string; title: string; note: string; info: string; sources: HomeSource[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card home-card list-card" data-tour={tour}>
      <div className="card-head">
        <h2>{title}</h2>
        <button className="card-note card-note-btn" data-tour={id === 'today' ? 'home.info' : undefined} aria-expanded={open} aria-controls={`${id}-info`} onClick={() => setOpen((o) => !o)}>
          {note} <Icon name="info" size={14} />
        </button>
      </div>
      {open && (
        <div className="muted small list-info" id={`${id}-info`}>
          <p>{info}</p>
          <h3 className="list-sources-head">{t('home.sources')}</h3>
          <ul className="list-sources">
            {sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer">
                  {s.label}
                </a>
                {s.about && ` · ${s.about}`}
              </li>
            ))}
          </ul>
          <p>{t('home.src.more')}</p>
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Today so far, in the diary page's five cells. A need shows % of the day's target; past it ✓ (energy: ↑,
 * over the target). Below it the cell has no status mark: the day is not over, so "low" would be wrong.
 * Fat, and carbs without an own maximum, have no sourced target: grams only. Carbs against an own maximum
 * show "44/50".
 */
function TodayCells({ defaultBased }: { defaultBased: (id: string) => boolean }) {
  const { amountOf, partOf, goalOf, own } = useToday();
  const { weightKg } = useData();
  const anyDefault = TODAY_CELLS.some((id) => goalOf(id) && defaultBased(id));
  return (
    <>
      <div className="macro-row list-today" role="group" aria-label={t('home.todayLabel')}>
        {TODAY_CELLS.map((id) => {
          const def = NUTRIENT_BY_ID.get(id);
          const unit = def?.unit ?? '';
          const amount = amountOf(id);
          const goal = goalOf(id);
          const at = partOf(id) ? '≥' : '';
          const share = goal ? amount / goal.amount : 0;
          const status = !goal ? 'info' : goal.max ? (share > 1 ? 'tooHigh' : 'fine') : share > 1 && id === 'ENERCC' ? 'tooHigh' : share >= 1 ? 'fine' : 'progress';
          const grams = `${at}${fmtNumber(amount, amount > 0 && amount < 10 ? 1 : 0)}`;
          const value = !goal ? (
            `${grams} ${unit}`
          ) : goal.max ? (
            <>
              {grams}
              <small className="cgauge-max">/{fmtNumber(goal.amount)}</small>
            </>
          ) : (
            `${at}${fmtPercent(share)}`
          );
          const spoken = [
            t('home.ringSpoken', { name: def?.name ?? id, amount: `${grams} ${unit}` }),
            goal ? t(goal.max ? 'home.ringMaxSpoken' : 'home.ringOfSpoken', { target: `${fmtNumber(goal.amount)} ${unit}` }) : t('home.ringNoTarget'),
            goal && !goal.max ? fmtPercent(share) : '',
            status === 'tooHigh' ? t(goal?.max ? 'home.ringOverSpoken' : 'home.overTargetSpoken') : '',
            own(id) ? t('gauge.ownTarget') : '',
            partOf(id) ? t('home.ringMissing') : '',
          ]
            .filter(Boolean)
            .join(', ');
          // No mark while in progress, nor on grams without a target: the narrow cell needs the room for the number.
          const icon = status === 'progress' || status === 'info' ? null : <Icon name={status === 'tooHigh' ? 'up' : 'check'} size={14} />;
          return (
            <button key={id} className={`cgauge cgauge-cell gauge-${goal?.max ? 'limit' : goal ? 'rolling' : 'info'} gauge-${status}`} onClick={() => navigate('nutrient', id)} aria-label={spoken}>
              <span className="cgauge-line">
                <span className="cgauge-name">
                  {def?.short ?? id}
                  {goal && defaultBased(id) && <span className="gauge-default">*</span>}
                </span>
                {own(id) && (
                  <span className="gauge-own">
                    <Icon name="target" size={12} />
                  </span>
                )}
              </span>
              <span className="cgauge-line">
                {icon}
                <span className="cgauge-value">{value}</span>
              </span>
              {goal && (
                <span className="cgauge-bar" aria-hidden>
                  <span className="cgauge-fill" style={{ width: `${Math.min(1, share / SCALE) * 100}%` }} />
                  <span className="cgauge-target" style={{ left: `${(1 / SCALE) * 100}%` }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {anyDefault && (
        <p className="muted small">
          * {t('home.ringsDefault', { kg: fmtNumber(weightKg) })} · <a href={href('settings', 'profile')}>{t('home.addProfile')}</a>
        </p>
      )}
    </>
  );
}
