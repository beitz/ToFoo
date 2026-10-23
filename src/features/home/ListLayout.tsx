import { useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { NutrientResult, StoreResult } from '../../model/simulate';
import { CompactGauge, StoreCompactGauge } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { urgencyRank } from '../../ui/status';
import { useToday } from './TodayRings';

/** Energy and the macronutrients, today's amounts in five cells at the top. */
const TODAY_CELLS = ['ENERCC', 'PROT625', 'FAT', 'CHO', 'FIBT'];
/** The cells' bars run to 150 %, so the target sits two thirds along, as in every list bar. */
const SCALE = 1.5;

const byUrgency = (a: NutrientResult, b: NutrientResult) => urgencyRank(a.status) - urgencyRank(b.status) || a.value.central - b.value.central;

/**
 * Home's list layout (owner's pick to try, 2026-10-23): the nutrient view from the diary's "Nutrients"
 * page, in three cards by how long each number is averaged over: today, the last 7 days, and the body
 * stores. Each heading has an ⓘ that says why.
 */
export function ListLayout({
  rest,
  stores,
  windowDays,
  startLevel,
  defaultBased,
}: {
  rest: NutrientResult[];
  stores: Array<NutrientResult & { store: StoreResult }>;
  windowDays: number;
  startLevel: string;
  defaultBased: (id: string) => boolean;
}) {
  const go = (id: string) => () => navigate('nutrient', id);
  const sortedStores = [...stores].sort((a, b) => urgencyRank(a.store.status) - urgencyRank(b.store.status) || a.store.fill.central - b.store.fill.central);
  return (
    <>
      <ListCard id="today" title={t('home.today')} note={t('home.todayNote')} info={t('home.todayInfo')}>
        <TodayCells defaultBased={defaultBased} />
      </ListCard>
      {rest.length > 0 && (
        <ListCard id="week" title={t('home.lastDays', { n: windowDays })} note={t('home.weekNote')} info={t('home.weekInfo', { n: windowDays })}>
          <div className="cgauge-grid">
            {[...rest].sort(byUrgency).map((r) => (
              <CompactGauge key={r.id} result={r} onClick={go(r.id)} />
            ))}
          </div>
        </ListCard>
      )}
      {stores.length > 0 && (
        <ListCard id="stores" title={t('home.stores')} note={t('home.storesListNote')} info={t('home.storesInfo', { start: t(`start.${startLevel}` as MessageKey) })}>
          <div className="cgauge-grid">
            {sortedStores.map((r) => (
              <StoreCompactGauge key={r.id} result={r} onClick={go(r.id)} />
            ))}
          </div>
        </ListCard>
      )}
    </>
  );
}

/** A card with its heading, a short note on what the numbers are, and an ⓘ that opens why. */
function ListCard({ id, title, note, info, children }: { id: string; title: string; note: string; info: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card home-card list-card">
      <div className="card-head">
        <h2>{title}</h2>
        <button className="card-note card-note-btn" aria-expanded={open} aria-controls={`${id}-info`} onClick={() => setOpen((o) => !o)}>
          {note} <Icon name="info" size={14} />
        </button>
      </div>
      {open && (
        <p className="muted small list-info" id={`${id}-info`}>
          {info}
        </p>
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
