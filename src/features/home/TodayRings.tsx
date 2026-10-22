import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { Icon } from '../../ui/Icon';
import { StatusMark } from '../../ui/Tile';

/** The four donuts beside the energy ring (owner's pick, 2026-10-22): protein, fat, carbs, fibre. */
const SMALL = ['PROT625', 'FAT', 'CHO', 'FIBT'];

/** What one ring compares today's amount with. Fat and carbs have no sourced target unless the user set a maximum. */
interface Goal {
  amount: number;
  /** A maximum (own carb limit) rather than a need. */
  max: boolean;
}

/**
 * Today at the top of Home (owner's ask, 2026-10-22): what was eaten so far today, as a calorie ring
 * and four macro donuts. Only today, unlike the 7-day card below. A ring fills towards the target;
 * past a maximum the extra laps on in the "too much" colour with ▲, and a nutrient without a target
 * shows its grams in a dashed ring. Each one taps through to its nutrient page.
 */
export function TodayRings({ defaultBased }: { defaultBased: (id: string) => boolean }) {
  const d = useData();
  const i = d.modelDays.indexOf(d.today);
  const day = i >= 0 ? d.model.daily[i] : undefined;
  const amountOf = (id: string) => day?.intake[id] ?? 0;
  // Some eaten food had no data for it: the sum is a lower bound, never read as complete.
  const partOf = (id: string) => day?.missing.has(id) ?? false;
  const goalOf = (id: string): Goal | undefined => {
    const r = d.model.nutrients.get(id);
    if (!r || r.kind === 'info') return undefined;
    if (r.kind === 'limit') return r.limit ? { amount: r.limit, max: true } : undefined;
    const rec = d.requirements.byNutrient.get(id)?.recommended;
    return rec ? { amount: rec, max: false } : undefined;
  };
  const own = (id: string) => d.model.nutrients.get(id)?.ownTarget === true;

  const kcal = amountOf('ENERCC');
  const kcalGoal = goalOf('ENERCC');
  const kcalText = `${partOf('ENERCC') ? '≥' : ''}${fmtNumber(kcal)}`;
  const diff = kcalGoal ? kcal - kcalGoal.amount : 0;
  const energySpoken = [
    t('home.ringSpoken', { name: NUTRIENT_BY_ID.get('ENERCC')?.name ?? 'Energy', amount: `${kcalText} kcal` }),
    kcalGoal ? t('home.ringOfSpoken', { target: `${fmtNumber(kcalGoal.amount)} kcal` }) : '',
    kcalGoal ? t(diff > 0 ? 'home.kcalOver' : 'home.kcalLeft', { kcal: fmtNumber(Math.abs(diff)) }) : '',
    partOf('ENERCC') ? t('home.ringMissing') : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <div className="card today-card" role="group" aria-label={t('home.todayLabel')}>
      <button type="button" className="today-big" onClick={() => navigate('nutrient', 'ENERCC')} aria-label={energySpoken}>
        <Ring size={132} stroke={11} share={kcalGoal ? kcal / kcalGoal.amount : undefined} over={diff > 0} />
        <span className="today-big-text" aria-hidden>
          <strong>{kcalText}</strong>
          <span className="today-big-unit">
            {kcalGoal ? t('diary.ofTarget', { kcal: `${fmtNumber(kcalGoal.amount)} kcal` }) : 'kcal'}
            {own('ENERCC') && <Icon name="target" size={11} />}
          </span>
          {kcalGoal && <span className={diff > 0 ? 'today-big-diff today-over' : 'today-big-diff'}>{t(diff > 0 ? 'home.kcalOver' : 'home.kcalLeft', { kcal: fmtNumber(Math.abs(diff)) })}</span>}
        </span>
      </button>
      <div className="today-small">
        {SMALL.map((id) => {
          const def = NUTRIENT_BY_ID.get(id);
          const amount = amountOf(id);
          const goal = goalOf(id);
          const over = !!goal?.max && amount > goal.amount;
          const value = `${partOf(id) ? '≥' : ''}${fmtNumber(amount, amount > 0 && amount < 10 ? 1 : 0)}`;
          const spoken = [
            t('home.ringSpoken', { name: def?.name ?? id, amount: `${value} g` }),
            goal ? t(goal.max ? 'home.ringMaxSpoken' : 'home.ringOfSpoken', { target: `${fmtNumber(goal.amount)} g` }) : t('home.ringNoTarget'),
            over ? t('home.ringOverSpoken') : '',
            own(id) ? t('gauge.ownTarget') : '',
            partOf(id) ? t('home.ringMissing') : '',
          ]
            .filter(Boolean)
            .join(', ');
          return (
            <button key={id} type="button" className="today-cell" onClick={() => navigate('nutrient', id)} aria-label={spoken}>
              <span className="today-ring" aria-hidden>
                <Ring size={48} stroke={5} share={goal ? amount / goal.amount : undefined} over={over} />
                <span className="today-ring-value">{value}</span>
              </span>
              <span className="today-cell-name" aria-hidden>
                {def?.short ?? id}
                {over && <StatusMark status="tooHigh" size={9} />}
                {own(id) && <Icon name="target" size={10} />}
              </span>
              <span className="today-cell-goal" aria-hidden>
                {goal ? `${goal.max ? t('home.ringMax') : t('home.ringOf')} ${fmtNumber(goal.amount)} g` : 'g'}
                {goal && defaultBased(id) && <span className="gauge-default">*</span>}
              </span>
            </button>
          );
        })}
      </div>
      {SMALL.some((id) => goalOf(id) && defaultBased(id)) && (
        <p className="muted small today-note">
          * {t('home.ringsDefault', { kg: fmtNumber(d.weightKg) })} · <a href={href('settings', 'profile')}>{t('home.addProfile')}</a>
        </p>
      )}
    </div>
  );
}

/**
 * A progress ring from the top, clockwise. `share` undefined = no target: a dashed track only. Past
 * 1 the ring stays full and, when `over` (a maximum crossed), the extra laps on in the "too much" colour.
 */
function Ring({ size, stroke, share, over }: { size: number; stroke: number; share?: number; over: boolean }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const main = Math.max(0, Math.min(1, share ?? 0));
  const extra = over && share !== undefined ? Math.max(0, Math.min(1, share - 1)) : 0;
  const arc = (part: number) => ({ strokeDasharray: `${part * c} ${c}` });
  return (
    <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`} fill="none" strokeWidth={stroke}>
        <circle className={share === undefined ? 'ring-track ring-open' : 'ring-track'} cx={size / 2} cy={size / 2} r={r} />
        {main > 0 && <circle className={over ? 'ring-fill ring-fill-over' : 'ring-fill'} cx={size / 2} cy={size / 2} r={r} strokeLinecap="round" style={arc(main)} />}
        {extra > 0 && <circle className="ring-extra" cx={size / 2} cy={size / 2} r={r} strokeLinecap="round" style={arc(extra)} />}
      </g>
    </svg>
  );
}
