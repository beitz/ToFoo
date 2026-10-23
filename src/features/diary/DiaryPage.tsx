import { CatchUpLine } from '../catchup/CatchUpLine';
import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { addDays, formatDate, formatDay, formatTime, parseDay } from '../../lib/dates';
import { followOnSleep, NEW_SLEEP_MS } from '../../logic/sleep';
import { fmtAmount } from '../../lib/format';
import { groupMeals } from '../../model/simulate';
import { repo } from '../../storage/repo';
import type { ActivityRecord, JournalEntry, LogEntry, SleepRecord, SunEntry, WaterRecord } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/controls';
import { entryAmount } from '../log/describe';
import { EditEntrySheet } from './EditEntrySheet';
import { useMealBreakdown } from '../meal/MealNutrientsPage';
import { SunEntrySheet } from './SunEntrySheet';
import { sunSessionsFor } from '../../logic/resolve';
import { logMealAgain } from '../log/logAgain';
import { isOn } from '../../settings/features';
import { JournalRow } from '../journal/JournalPage';
import { JournalSheet } from '../journal/JournalSheet';
import { useJournal } from '../journal/useJournal';
import { defaultTimeFor } from '../log/time';
import { useSleep } from '../sleep/useSleep';
import { SleepSheet } from '../sleep/SleepSheet';
import { spanText } from '../sleep/format';
import { ActivitySheet } from '../activity/ActivitySheet';
import { activityName } from '../activity/ActivityForm';
import { useActivities } from '../activity/useActivities';
import { WaterCard } from '../water/WaterCard';
import { WaterSheet } from '../water/WaterSheet';
import { useWater } from '../water/useWater';
import { waterText } from '../water/format';
import { InsightsTabs } from '../review/InsightsTabs';
import { waterTarget } from '../../logic/water';
import { AskChips } from '../../ui/AskChips';
import { DAY_ICON } from '../review/dayStatus';

/** "Wednesday 21.10.2026". */
const longDay = (day: string) => `${parseDay(day).toLocaleDateString('en-GB', { weekday: 'long' })} ${formatDate(day)}`;

type StatusChoice = 'auto' | 'logged' | 'partial' | 'fasted' | 'filled' | 'excluded';

export function DiaryPage({ day: dayParam }: { day?: string }) {
  const d = useData();
  const toast = useToast();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) && dayParam <= d.today ? dayParam : d.today;
  const [editing, setEditing] = useState<LogEntry | null>(null);
  const [addingSun, setAddingSun] = useState(false);
  // A journal entry being edited, or 'new' for one being written.
  const [journalSheet, setJournalSheet] = useState<JournalEntry | 'new' | null>(null);
  const journalOn = isOn(d.settings.features, 'journal');
  const notes = useJournal(day) ?? [];
  const sleepOn = isOn(d.settings.features, 'sleep');
  const sleeps = useSleep(day) ?? [];
  // All sleeps, for a new one that follows on from the last (it may have ended the day before).
  const allSleeps = useSleep();
  // A sleep being edited, or 'new' for one being added.
  const [sleepSheet, setSleepSheet] = useState<SleepRecord | 'new' | null>(null);
  const activityOn = isOn(d.settings.features, 'activity');
  const activities = useActivities(day) ?? [];
  // An activity being edited, or 'new' for one being added.
  const [activitySheet, setActivitySheet] = useState<ActivityRecord | 'new' | null>(null);
  const waterOn = isOn(d.settings.features, 'water');
  const water = useWater(day) ?? [];
  const [waterSheet, setWaterSheet] = useState<WaterRecord | null>(null);
  // The day status choices fold away; the status itself shows at the top of the day card.
  const [statusOpen, setStatusOpen] = useState(false);

  const entries = d.log.filter((e) => e.day === day);
  const meals = groupMeals(entries, d.settings.mealWindowMinutes);
  // Meals, journal entries, sleeps and activities in one timeline, so "tired after lunch" sits after
  // the lunch; journal entries with no meal between them share a card. A sleep sits where it ended.
  type Item =
    | { kind: 'meal'; time: number; meal: LogEntry[] }
    | { kind: 'notes'; time: number; notes: JournalEntry[] }
    | { kind: 'sleep'; time: number; sleep: SleepRecord }
    | { kind: 'activity'; time: number; activity: ActivityRecord };
  const timeline: Item[] = [];
  const sorted = [
    ...meals.map((meal) => ({ time: meal[0]!.time, meal })),
    ...notes.map((note) => ({ time: note.time, note })),
    ...(sleepOn ? sleeps.map((sleep) => ({ time: sleep.end ?? sleep.start, sleep })) : []),
    ...(activityOn ? activities.map((activity) => ({ time: activity.time, activity })) : []),
  ].sort((a, b) => a.time - b.time);
  for (const x of sorted) {
    const last = timeline[timeline.length - 1];
    if ('meal' in x) timeline.push({ kind: 'meal', time: x.time, meal: x.meal });
    else if ('sleep' in x) timeline.push({ kind: 'sleep', time: x.time, sleep: x.sleep });
    else if ('activity' in x) timeline.push({ kind: 'activity', time: x.time, activity: x.activity });
    else if (last?.kind === 'notes') last.notes.push(x.note);
    else timeline.push({ kind: 'notes', time: x.time, notes: [x.note] });
  }
  const explicit = d.dayStatus.find((s) => s.day === day)?.status;
  const choice: StatusChoice = explicit ?? 'auto';
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
      <InsightsTabs view="diary" day={day} />
      <header className="week-head">
        <div className="grow">
          <h1>{formatDay(day, d.today)}</h1>
          <p className="muted small">{longDay(day)}</p>
        </div>
        <button className="icon-btn" onClick={() => navigate('diary', addDays(day, -1))} aria-label={t('diary.prev')}>
          <Icon name="back" />
        </button>
        <button className="icon-btn" disabled={day >= d.today} onClick={() => navigate('diary', addDays(day, 1))} aria-label={t('diary.next')}>
          <Icon name="chevron" />
        </button>
      </header>
      <CatchUpLine day={day} />

      <div className="card diary-day">
        <div className="card-head">
          <h2>{t('diary.theDay')}</h2>
          <span className={`diary-status day-${effective}`}>
            <Icon name={DAY_ICON[effective]} size={14} /> {t(`day.${effective}` as MessageKey)}
          </span>
        </div>
        <DayEnergy kcal={totals.ENERCC} target={d.requirements.byNutrient.get('ENERCC')?.recommended} />
        {mealSummary.length > 0 && (
          <p className="small muted diary-macros">
            {t('nutrient.protein')} <strong>{fmtAmount('PROT625', totals.PROT625 ?? 0)}</strong> · {t('nutrient.fat')} <strong>{fmtAmount('FAT', totals.FAT ?? 0)}</strong> · {t('diary.carbs')}{' '}
            <strong>{fmtAmount('CHO', totals.CHO ?? 0)}</strong>
          </p>
        )}
        <div className="row diary-links">
          <a className="btn btn-small btn-secondary" href={href('review', day, day)}>
            <Icon name="bars" size={18} /> {t('diary.dayNutrients')}
          </a>
        </div>
        <details className="fold diary-status-fold" open={statusOpen} onToggle={(e) => setStatusOpen((e.target as HTMLDetailsElement).open)}>
          <summary>
            <span className="grow small">{t('diary.statusChange')}</span>
            <Icon name="down" size={16} />
          </summary>
          <Segmented<StatusChoice>
            label={t('diary.status')}
            className="segmented-grid"
            value={choice}
            onChange={(v) => void setStatus(v)}
            options={[
              { value: 'auto', label: t('diary.auto') },
              { value: 'logged', label: t('diary.complete') },
              { value: 'partial', label: t('diary.partial') },
              { value: 'fasted', label: t('diary.fasted') },
              { value: 'filled', label: t('diary.filled') },
              { value: 'excluded', label: t('diary.excluded') },
            ]}
          />
          <p className="muted small">{t(choice === 'auto' && isOn(d.settings.features, 'fillUnloggedDays') ? 'diary.hint.autoFilled' : (`diary.hint.${choice}` as MessageKey))}</p>
        </details>
      </div>
      {day < d.today && mealSummary.length > 0 && <AskChips questions={[t('diary.ask', { day: longDay(day) })]} />}

      <div className={journalOn || sleepOn || activityOn ? 'diary-actions' : undefined}>
        <a className="btn btn-primary btn-block" href={href('log', day)}>
          <Icon name="plus" /> {t('diary.logForDay')}
        </a>
        {journalOn && (
          <button className="btn btn-secondary btn-block" onClick={() => setJournalSheet('new')}>
            <Icon name="plus" /> {t(sleepOn && activityOn ? 'journal.entry' : 'journal.entryShort')}
          </button>
        )}
        {sleepOn && (
          <button className="btn btn-secondary btn-block" onClick={() => setSleepSheet('new')}>
            <Icon name="plus" /> {t('sleep.short')}
          </button>
        )}
        {activityOn && (
          <button className="btn btn-secondary btn-block" onClick={() => setActivitySheet('new')}>
            <Icon name="plus" /> {t('activity.short')}
          </button>
        )}
      </div>

      {timeline.length === 0 && <p className="muted empty">{t('diary.empty')}</p>}
      {timeline.map((item) =>
        item.kind === 'activity' ? (
          <div className="card sleep-card" key={item.activity.id}>
            <button className="entry-row" onClick={() => setActivitySheet(item.activity)}>
              <span className="entry-label journal-label">
                <Icon name="activity" size={16} /> {activityName(item.activity)}
              </span>
              <span className="muted small">{activitySummary(item.activity)}</span>
              <span className="entry-edit">
                <Icon name="edit" size={16} />
              </span>
            </button>
            <a className="meal-foot" href={href('activity')}>
              <Icon name="activity" size={16} />
              <span className="grow">{t('diary.allActivities')}</span>
              <Icon name="chevron" size={16} />
            </a>
          </div>
        ) : item.kind === 'sleep' ? (
          <div className="card sleep-card" key={item.sleep.id}>
            <button className="entry-row" onClick={() => setSleepSheet(item.sleep)}>
              <span className="entry-label journal-label">
                <Icon name="bed" size={16} /> {t('sleep.short')}
              </span>
              <span className="muted small">
                {item.sleep.end !== undefined ? spanText({ start: item.sleep.start, end: item.sleep.end }) : t('sleep.since', { time: formatTime(item.sleep.start) })}
              </span>
              <span className="entry-edit">
                <Icon name="edit" size={16} />
              </span>
            </button>
            <a className="meal-foot" href={href('nights')}>
              <Icon name="moon" size={16} />
              <span className="grow">{t('diary.allNights')}</span>
              <Icon name="chevron" size={16} />
            </a>
          </div>
        ) : item.kind === 'notes' ? (
          <div className="card journal-card" key={item.notes[0]!.id}>
            <span className="muted small journal-label">
              <Icon name="journal" size={16} /> {t('journal.entry')}
            </span>
            <ul className="plain-list">
              {item.notes.map((note) => (
                <li key={note.id}>
                  <JournalRow entry={note} onEdit={() => setJournalSheet(note)} />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <MealCard key={item.meal[0]!.id} meal={item.meal} day={day} onEdit={setEditing} />
        ),
      )}

      {meals.length > 0 && <p className="muted small">{t('diary.editHint')}</p>}

      {waterOn && (
        <>
          <WaterCard day={day} />
          {water.length > 0 && (
            <ul className="plain-list water-list">
              {water.map((w) => (
                <li key={w.id}>
                  <button className="entry-row" onClick={() => setWaterSheet(w)}>
                    <span className="entry-label">{t('water.entry', { time: formatTime(w.time), amount: waterText(w.ml) })}</span>
                    <span className="entry-edit">
                      <Icon name="edit" size={16} />
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="muted small">{t('water.guide', { target: waterText(waterTarget(d.requirements.ageGroup)) })}</p>
        </>
      )}

      <h2 className="section-title">
        <Icon name="sun" /> {t('diary.outside')}
      </h2>
      <p className="muted small">
        {routine.length ? t('diary.routine', { min: routine.reduce((a, s) => a + s.minutes, 0) }) : t('diary.noRoutine')} <a href={href('settings', 'sun')}>{t('diary.editRoutine')}</a>
      </p>
      <ul className="plain-list">
        {sunToday.map((s) => (
          <li key={s.id} className="row-between">
            <span>
              {t('diary.sunEntry', { min: s.minutes, time: `${String(Math.floor(s.startHour)).padStart(2, '0')}:${String(Math.round((s.startHour % 1) * 60)).padStart(2, '0')}` })} ·{' '}
              {t(`skin.${s.skin}` as MessageKey)}
            </span>
            <button className="icon-btn" onClick={() => void removeSun(s)} aria-label={t('common.delete')}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
        {activityOn &&
          activities
            .filter((a) => a.outside && a.sunSkin)
            .map((a) => (
              <li key={a.id} className="row-between">
                <span>
                  {activityName(a)}: {t('diary.sunEntry', { min: a.minutes, time: formatTime(a.time) })} · {t(`skin.${a.sunSkin}` as MessageKey)}
                </span>
              </li>
            ))}
      </ul>
      <button className="btn btn-secondary" onClick={() => setAddingSun(true)}>
        <Icon name="plus" /> {t('diary.addOutside')}
      </button>

      {editing && <EditEntrySheet entry={editing} onClose={() => setEditing(null)} />}
      {addingSun && <SunEntrySheet day={day} onClose={() => setAddingSun(false)} />}
      {sleepSheet && (
        <SleepSheet
          record={sleepSheet === 'new' ? undefined : sleepSheet}
          initial={sleepSheet === 'new' ? sleepDefault(day, d.today, allSleeps ?? []) : undefined}
          onClose={() => setSleepSheet(null)}
        />
      )}
      {waterSheet && <WaterSheet record={waterSheet} defaultTime={waterSheet.time} onClose={() => setWaterSheet(null)} />}
      {activitySheet && <ActivitySheet activity={activitySheet === 'new' ? undefined : activitySheet} defaultTime={defaultTimeFor(day, d.today)} onClose={() => setActivitySheet(null)} />}
      {journalSheet && <JournalSheet entry={journalSheet === 'new' ? undefined : journalSheet} defaultTime={defaultTimeFor(day, d.today)} onClose={() => setJournalSheet(null)} />}
    </section>
  );
}

/**
 * A new sleep in the diary: today, right after a sleep that ended in the last few hours, from half an
 * hour after it until now (waking up in the night); otherwise the night that ended that morning,
 * 23:00 to 07:00. The user adjusts it.
 */
function sleepDefault(day: string, today: string, records: SleepRecord[]): { start: number; end: number } {
  const now = Date.now();
  const next = day === today ? followOnSleep(records, now) : undefined;
  if (next) return next;
  const morning = parseDay(day);
  morning.setHours(7, 0, 0, 0);
  const end = Math.min(morning.getTime(), now);
  return { start: end - NEW_SLEEP_MS, end };
}

/** One meal: its items, each opening its page (with a pencil to edit straight away), "Log again", and its energy with a link to all its nutrients. */
function MealCard({ meal, day, onEdit }: { meal: LogEntry[]; day: string; onEdit: (e: LogEntry) => void }) {
  const d = useData();
  const toast = useToast();
  const kcal = useMealBreakdown(meal.map((e) => ({ entryId: e.id }))).intake.ENERCC;
  return (
    <div className="card meal">
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
          <li key={e.id} className="entry-line">
            <a className="entry-row" href={href('entry', e.id)}>
              <span className="entry-label">{e.label}</span>
              <span className="muted small">{entryAmount(e, d)}</span>
              <span className={`conf conf-${e.confidence}`} title={t(`confidence.${e.confidence}` as MessageKey)}>
                {e.confidence}
              </span>
            </a>
            <button className="icon-btn entry-edit-btn" onClick={() => onEdit(e)} aria-label={t('diary.editItem', { name: e.label })}>
              <Icon name="edit" size={16} />
            </button>
          </li>
        ))}
      </ul>
      <a className="meal-foot" href={href('meal', meal[0]!.id)} aria-label={t('diary.mealNutrientsLabel', { time: formatTime(meal[0]!.time) })}>
        <Icon name="bars" size={16} />
        <span className="grow">{t('diary.mealNutrients')}</span>
        {kcal !== undefined && <span className="muted small">{fmtAmount('ENERCC', kcal)}</span>}
        <Icon name="chevron" size={16} />
      </a>
    </div>
  );
}

/** "14:30 · 45 min · Moderate · outside" */
function activitySummary(a: ActivityRecord): string {
  return [
    formatTime(a.time),
    t('activity.summary', { min: a.minutes }),
    ...(a.intensity ? [t(`activity.intensity.${a.intensity}` as MessageKey)] : []),
    ...(a.outside ? [t('activity.outsideMark')] : []),
  ].join(' · ');
}

/** Energy eaten this day against the target, as one bar with the target as a line. */
function DayEnergy({ kcal, target }: { kcal?: number; target?: number }) {
  const eaten = kcal ?? 0;
  const top = Math.max((target ?? eaten) * 1.25, eaten, 1);
  return (
    <div className="diary-energy">
      <p className="diary-energy-text">
        <strong>{fmtAmount('ENERCC', eaten)}</strong>
        {target ? <span className="muted"> {t('diary.ofTarget', { kcal: fmtAmount('ENERCC', target) })}</span> : null}
      </p>
      <span className="diary-energy-track" aria-hidden>
        <span className="diary-energy-bar" style={{ width: `${(eaten / top) * 100}%` }} />
        {target ? <span className="diary-energy-target" style={{ left: `${(target / top) * 100}%` }} /> : null}
      </span>
    </div>
  );
}
