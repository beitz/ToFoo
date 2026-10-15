import { useData } from '../../app/data';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { DEFAULT_LATITUDE } from '../../logic/resolve';
import { sunVitaminD } from '../../model/sun';
import { sun as sunParams, sunGuidance } from '../../../model/parameters';
import { repo } from '../../storage/repo';
import type { OutdoorSession } from '../../storage/types';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { SubPage } from './ProfilePage';
import { SkinSelect } from './SkinSelect';

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0];
const toTime = (h: number) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;
const fromTime = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return (h ?? 12) + (m ?? 0) / 60;
};

/** Outdoor routine for the vitamin D sun estimate. */
export function SunPage() {
  const d = useData();
  const p = d.profile;
  const def = sunParams.defaultRoutine.value;
  const routine: OutdoorSession[] = p.outdoorRoutine ?? [{ weekdays: [0, 1, 2, 3, 4, 5, 6], startHour: def.startHour, minutes: def.minutesPerDay, skin: def.skin }];
  const save = (r: OutdoorSession[]) => repo.updateProfile({ outdoorRoutine: r });
  const update = (i: number, patch: Partial<OutdoorSession>) => save(routine.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const lat = p.latitude ?? DEFAULT_LATITUDE;
  const year = Number(d.today.slice(0, 4));
  const estimate = (month: number, offset: number) => {
    const weekday = new Date(year, month - 1, 15).getDay();
    const sessions = routine.filter((s) => s.weekdays.includes(weekday)).map((s) => ({ startHour: s.startHour, minutes: s.minutes, skin: s.skin }));
    return sunVitaminD({ year, month, day: 15, utcOffsetHours: offset, latitude: lat, sessions });
  };
  const june = estimate(6, 2);
  const dec = estimate(12, 1);
  const today = d.model.nutrients.get('VITD');

  return (
    <SubPage title={t('settings.sun')}>
      <p className="muted small">{t('sun.intro')}</p>
      {!p.outdoorRoutine && <p className="notice small">{t('sun.usingDefault')}</p>}
      {routine.map((s, i) => (
        <div className="card" key={i}>
          <div className="weekday-row" role="group" aria-label={t('sun.weekdays')}>
            {WEEKDAYS.map((w) => (
              <button
                key={w}
                className={`chip chip-small${s.weekdays.includes(w) ? ' on' : ''}`}
                aria-pressed={s.weekdays.includes(w)}
                onClick={() => update(i, { weekdays: s.weekdays.includes(w) ? s.weekdays.filter((x) => x !== w) : [...s.weekdays, w] })}
              >
                {new Date(2026, 0, 4 + w).toLocaleDateString('en-GB', { weekday: 'short' })}
              </button>
            ))}
          </div>
          <div className="grid-2">
            <Field label={t('sun.start')}>{(id) => <input id={id} type="time" value={toTime(s.startHour)} onChange={(e) => e.target.value && update(i, { startHour: fromTime(e.target.value) })} />}</Field>
            <Field label={t('sun.minutes')}>{(id) => <NumberInput id={id} value={s.minutes} onChange={(v) => update(i, { minutes: v ?? 0 })} suffix="min" min={0} />}</Field>
          </div>
          <SkinSelect id={`skin-${i}`} value={s.skin} onChange={(skin) => update(i, { skin })} />
          <button className="btn btn-small btn-ghost" onClick={() => save(routine.filter((_, j) => j !== i))}>
            <Icon name="trash" size={16} /> {t('common.delete')}
          </button>
        </div>
      ))}
      <button className="btn btn-secondary" onClick={() => save([...routine, { weekdays: [1, 2, 3, 4, 5], startHour: 12.5, minutes: 20, skin: 'faceHands' }])}>
        <Icon name="plus" /> {t('sun.addSession')}
      </button>

      <div className="card">
        <Field label={t('sun.latitude')} hint={t('sun.latitudeHint')}>
          {(id) => <NumberInput id={id} value={p.latitude} onChange={(v) => repo.updateProfile({ latitude: v !== undefined && v >= -90 && v <= 90 ? v : undefined })} placeholder={String(DEFAULT_LATITUDE)} suffix="° N" />}
        </Field>
      </div>

      <h2 className="section-title">{t('sun.estimate')}</h2>
      <div className="card small">
        <p>{t('sun.estimateJune', { ug: fmtNumber(june.central, 1), low: fmtNumber(june.low, 1), high: fmtNumber(june.high, 1) })}</p>
        <p>{t('sun.estimateDec', { ug: fmtNumber(dec.central, 1) })}</p>
        {today && <p className="muted">{t('sun.need', { ug: fmtNumber(d.requirements.byNutrient.get('VITD')?.recommended ?? 20, 0) })}</p>}
        <p className="muted">{t('sun.winter')}</p>
        <p className="muted">{sunGuidance.source}</p>
      </div>
    </SubPage>
  );
}
