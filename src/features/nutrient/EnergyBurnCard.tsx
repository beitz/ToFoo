import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { burnByDay } from '../../logic/energyBurn';
import { InfoButton } from '../../ui/InfoButton';
import { useBurnBase } from '../activity/useBurn';
import { fmtKcal10 } from '../weight/format';

/**
 * Energy page (docs/SPEC.md, "Energy burned"): what yesterday and today burned, an ordinary day plus
 * the logged activities, next to what was eaten. The energy target stays as it is.
 */
export function EnergyBurnCard() {
  const d = useData();
  const base = useBurnBase();
  if (!base) return null;
  const days = [addDays(d.today, -1), d.today];
  const burns = burnByDay(days, d.activities, base);
  const e = d.requirements.energy;
  // model.daily is aligned with modelDays and ends today.
  const eaten = (day: string) => {
    const i = d.modelDays.indexOf(day);
    return i < 0 ? undefined : d.model.daily[i]?.intake.ENERCC;
  };
  const cells = days.map((day) => ({ day, b: burns.get(day)!, eaten: eaten(day) }));
  const factor = e.estimate?.factor ?? 1;

  return (
    <div className="card" data-tour="nutrient.burn">
      <div className="card-head">
        <h2>{t('burn.title')}</h2>
        <InfoButton title={t('burn.title')}>
          <p>
            {e.estimate
              ? t(factor !== 1 ? 'burn.baseEstimateCorrected' : 'burn.baseEstimate', {
                  ree: fmtKcal10(e.estimate.reeKcal),
                  pal: fmtNumber(e.estimate.pal, 1),
                  factor: fmtNumber(factor, 2),
                  kcal: fmtKcal10(e.estimate.kcal),
                })
              : t('burn.baseGuide', { kcal: fmtKcal10(e.guideKcal) })}
          </p>
          <p>{t('burn.activitiesHow')}</p>
          <p>{t('burn.targetStays')}</p>
          <p className="small muted">{t('burn.sources')}</p>
        </InfoButton>
      </div>
      <table className="burn-table">
        <thead>
          <tr>
            <th />
            <th scope="col">{t('burn.yesterday')}</th>
            <th scope="col">{t('burn.today')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">{t('burn.base')}</th>
            {cells.map((c) => (
              <td key={c.day}>{fmtKcal10(c.b.baseKcal)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">
              <a href={href('activity')}>{t('burn.activities')}</a>
            </th>
            {cells.map((c) => (
              <td key={c.day}>
                {c.b.activityKcal > 0 ? `+${fmtKcal10(c.b.activityKcal)}` : c.b.unknown ? '' : '0'}
                {c.b.unknown > 0 && <span className="muted small block">{t('burn.unknown', { n: c.b.unknown })}</span>}
              </td>
            ))}
          </tr>
          <tr className="burn-total">
            <th scope="row">{t('burn.burned')}</th>
            {cells.map((c) => (
              <td key={c.day}>{fmtKcal10(c.b.totalKcal)}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">{t('burn.eaten')}</th>
            {cells.map((c) => (
              <td key={c.day}>{c.eaten !== undefined ? fmtKcal10(c.eaten) : '–'}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="small muted">{t('burn.note', { kcal: fmtKcal10(e.kcal) })}</p>
    </div>
  );
}
