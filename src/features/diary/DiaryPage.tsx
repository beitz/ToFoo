import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, formatDay, formatTime } from '../../lib/dates';
import { fmtAmount } from '../../lib/format';
import { groupMeals } from '../../model/simulate';
import { repo } from '../../storage/repo';
import type { LogEntry, SunEntry } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/controls';
import { entryAmount } from '../log/describe';
import { EditEntrySheet } from './EditEntrySheet';
import { SunEntrySheet } from './SunEntrySheet';
import { sunSessionsFor } from '../../logic/resolve';
import { logMealAgain } from '../log/logAgain';

type StatusChoice = 'auto' | 'logged' | 'partial' | 'fasted';

export function DiaryPage({ day: dayParam }: { day?: string }) {
  const d = useData();
  const toast = useToast();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= d.today ? dayParam : d.today;
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [addingSun, setAddingSun] = useState(false);

  const entries = d.log.filter((e) => e.day === day);
  const meals = groupMeals(entries, d.settings.mealWindowMinutes);
  const explicit = d.dayStatus.find((s) => s.day === day)?.status;
  const effective = d.model.dayStatus[day] ?? 'unknown';
  const mealSummary = d.model.meals.filter((m) => m.day === day);
  const totals = mealSummary.reduce<Record<string, number>>((acc, m) => {
    for (const [k, v] of Object.entries(m.intake)) acc[k] = (acc[k] ?? 0) + v;
    return acc;
  }, {});
  const sunToday = d.sunEntries.filter((s) => s.day === day);
  const routine = sunSessionsFor(day, { ...d.profile }, []);

  async function setStatus(s: StatusChoice) {
    const prev = explicit ?? null;
    await repo.setDayStatus(day, s === 'auto' ? null : s);
    toast(t('diary.statusSaved'), () => void repo.setDayStatus(day, prev));
  }

  async function removeSun(s: SunEntry) {
    await repo.deleteSunEntry(s.id);
    toast(t('diary.sunRemoved'), () => void repo.db.sunEntries.put(s));
  }

  return (
    <section>
      <header className="page-head row-between">
        <button className="icon-btn" onClick={() => navigate('diary', addDays(day, -1))} aria-label={t('diary.prev')}>
          <Icon name="back" />
        </button>
        <h1>{formatDay(day, d.today)}</h1>
        <button className="icon-btn" disabled={day >= d.today} onClick={() => navigate('diary', addDays(day, 1))} aria-label={t('diary.next')}>
          <Icon name="chevron" />
        </button>
      </header>

      <div className="row diary-links">
        <a className="btn btn-small btn-secondary" href={href('calendar', day.slice(0, 7))}>
          <Icon name="calendar" size={18} /> {t('diary.calendar')}
        </a>
        <a className="btn btn-small btn-secondary" href={href('review', day, day)}>
          <Icon name="bars" size={18} /> {t('diary.dayNutrients')}
        </a>
      </div>

      <div className="card">
        <div className="row-between">
          <span className="muted small">{t('diary.status')}</span>
          <strong>{t(`day.${effective}` as MessageKey)}</strong>
        </div>
        <Segmented<StatusChoice>
          label={t('diary.status')}
          value={explicit ?? 'auto'}
          onChange={(v) => void setStatus(v)}
          options={[
            { value: 'auto', label: t('diary.auto') },
            { value: 'logged', label: t('diary.complete') },
            { value: 'partial', label: t('diary.partial') },
            { value: 'fasted', label: t('diary.fasted') },
          ]}
        />
        <p className="muted small">{t('diary.statusHint')}</p>
      </div>

      <a className="btn btn-primary btn-block" href={href('log', day)}>
        <Icon name="plus" /> {t('diary.logForDay')}
      </a>

      {meals.length === 0 && <p className="muted empty">{t('diary.empty')}</p>}
      {meals.map((meal) => (
        <div className="card meal" key={meal[0]!.id}>
          <div className="meal-head">
            <strong>{formatTime(meal[0]!.time)}</strong>
            <span className="muted small">{t('diary.meal')}</span>
            <button
              className="btn btn-small btn-ghost meal-again"
              aria-label={t('repeat.againLabel')}
              onClick={async () => {
                // The copy is logged now; show today's diary so it can be edited straight away.
                const added = await logMealAgain(meal, Date.now(), d.batchesById, toast);
                if (added.length && day !== d.today) navigate('diary');
              }}
            >
              <Icon name="repeat" size={16} /> {t('repeat.again')}
            </button>
          </div>
          <ul className="plain-list">
            {meal.map((e) => (
              <li key={e.id}>
                <button className="entry-row" onClick={() => setEditing(e)}>
                  <span className="entry-label">{e.label}</span>
                  <span className="muted small">{entryAmount(e, d)}</span>
                  <span className={`conf conf-${e.confidence}`} title={t(`confidence.${e.confidence}` as MessageKey)}>
                    {e.confidence}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {mealSummary.length > 0 && (
        <p className="muted small">
          {t('diary.totals')}: {fmtAmount('ENERCC', totals.ENERCC ?? 0)} · {t('nutrient.protein')} {fmtAmount('PROT625', totals.PROT625 ?? 0)} · {t('nutrient.fat')} {fmtAmount('FAT', totals.FAT ?? 0)}
        </p>
      )}

      <h2 className="section-title">
        <Icon name="sun" /> {t('diary.outside')}
      </h2>
      <p className="muted small">
        {routine.length ? t('diary.routine', { min: routine.reduce((a, s) => a + s.minutes, 0) }) : t('diary.noRoutine')}{' '}
        <a href={href('settings', 'sun')}>{t('diary.editRoutine')}</a>
      </p>
      <ul className="plain-list">
        {sunToday.map((s) => (
          <li key={s.id} className="row-between">
            <span>
              {t('diary.sunEntry', { min: s.minutes, time: `${String(Math.floor(s.startHour)).padStart(2, '0')}:${String(Math.round((s.startHour % 1) * 60)).padStart(2, '0')}` })} · {t(`skin.${s.skin}` as MessageKey)}
            </span>
            <button className="icon-btn" onClick={() => void removeSun(s)} aria-label={t('common.delete')}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      <button className="btn btn-secondary" onClick={() => setAddingSun(true)}>
        <Icon name="plus" /> {t('diary.addOutside')}
      </button>

      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {addingSun && <SunEntrySheet day={day} onClose={() => setAddingSun(false)} />}
    </section>
  );
}
