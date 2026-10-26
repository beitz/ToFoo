import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { navigate, replaceRoute } from '../../app/router';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { ACTIVITY_KINDS, HABIT_COLOURS, HABIT_KINDS, INTENSITIES, type Habit, type HabitActivity, type HabitColour, type HabitGoal, type HabitKind, type HabitQuickLog, type Intensity } from '../../storage/types';
import { BackButton } from '../../ui/BackButton';
import { Field, NumberInput, Segmented, Toggle } from '../../ui/controls';
import { activityCounts } from '../../logic/habits';
import { MAX_ACTIVITY_MINUTES } from '../../logic/activity';
import { activityName } from '../activity/ActivityForm';
import { habitStyle, weekdayName } from './HabitParts';
import { useHabits } from './useHabits';

/** Names longer than this are cut on the Home card; the field says so, it doesn't stop the user. */
const CARD_NAME = 8;
const MAX_NAME = 24;

type GoalType = HabitGoal['type'];

interface Draft {
  name: string;
  colour: HabitColour;
  kind: HabitKind;
  goalType: GoalType;
  days: number[];
  times: number | undefined;
  minutes: number | undefined;
  activities: HabitActivity[];
  /** "One tap logs it" and its activity (kept while switched off, so switching back keeps it). */
  quickOn: boolean;
  quick: Omit<HabitQuickLog, 'minutes'> & { minutes: number | undefined };
}

const OUTSIDE_KINDS = new Set(['walk', 'run', 'cycling']);

/** A first preset: the habit's first activity (else a walk) for its minutes. */
function quickFor(activities: HabitActivity[], minutes: number | undefined): Draft['quick'] {
  const a = activities[0] ?? { kind: 'walk' as const };
  return { kind: a.kind, ...(a.name ? { name: a.name } : {}), minutes, intensity: a.kind === 'walk' ? 'easy' : 'moderate', outside: OUTSIDE_KINDS.has(a.kind), sun: true };
}

const sameActivity = (a: HabitActivity, b: HabitActivity) => a.kind === b.kind && (a.name ?? '').toLowerCase() === (b.name ?? '').toLowerCase();

function draftOf(h: Habit | undefined, used: number): Draft {
  if (!h) return { name: '', colour: HABIT_COLOURS[used % HABIT_COLOURS.length]!, kind: 'do', goalType: 'daily', days: [1, 3, 5], times: 2, minutes: 30, activities: [], quickOn: false, quick: quickFor([], 30) };
  return {
    name: h.name,
    colour: h.colour,
    kind: h.kind,
    goalType: h.goal.type,
    days: h.goal.type === 'weekdays' ? h.goal.days : [1, 3, 5],
    times: h.goal.type === 'perWeek' ? h.goal.times : 2,
    minutes: h.minutes ?? 30,
    activities: h.activities ?? [],
    quickOn: !!h.quick,
    quick: h.quick ?? quickFor(h.activities ?? [], h.minutes ?? 30),
  };
}

/** The habit's fields, or what to fix first. */
function fieldsOf(d: Draft): { ok: true; fields: Omit<Habit, 'id' | 'schemaVersion' | 'order' | 'createdAt' | 'archived'> } | { ok: false; problem: MessageKey } {
  const name = d.name.trim();
  if (!name) return { ok: false, problem: 'habits.problem.name' };
  const maxTimes = d.kind === 'avoid' ? 6 : 7;
  let goal: HabitGoal;
  if (d.goalType === 'weekdays') {
    if (!d.days.length) return { ok: false, problem: 'habits.problem.days' };
    goal = { type: 'weekdays', days: [...d.days].sort() };
  } else if (d.goalType === 'perWeek') {
    if (!d.times || !Number.isInteger(d.times) || d.times < 1 || d.times > maxTimes) return { ok: false, problem: d.kind === 'avoid' ? 'habits.problem.timesAvoid' : 'habits.problem.times' };
    goal = { type: 'perWeek', times: d.times };
  } else goal = { type: 'daily' };
  if (d.kind !== 'minutes') return { ok: true, fields: { name, colour: d.colour, kind: d.kind, goal } };
  if (!d.minutes || d.minutes <= 0 || d.minutes > 16 * 60) return { ok: false, problem: 'habits.problem.minutes' };
  const fields = { name, colour: d.colour, kind: 'minutes' as const, goal, minutes: Math.round(d.minutes), activities: d.activities };
  if (!d.quickOn) return { ok: true, fields };
  const q = d.quick;
  if (!q.minutes || q.minutes <= 0 || q.minutes > MAX_ACTIVITY_MINUTES) return { ok: false, problem: 'habits.problem.quickMinutes' };
  // The logged activity has to count for the habit, or a tap would change nothing on its card.
  if (!activityCounts({ activities: d.activities }, q)) return { ok: false, problem: 'habits.problem.quickCounts' };
  const qName = q.name?.trim();
  return { ok: true, fields: { ...fields, quick: { kind: q.kind, ...(qName ? { name: qName } : {}), minutes: Math.round(q.minutes), intensity: q.intensity, outside: q.outside, sun: q.sun } } };
}

/**
 * #/habits/new and #/habits/<id>/edit: name, colour, do / avoid / minutes of activity, and the goal.
 * An existing habit can also be moved, archived or deleted (with undo).
 */
export function HabitEditor({ id }: { id?: string }) {
  const d = useData();
  const habits = useHabits();
  if (!habits) return null;
  const habit = id ? habits.all.find((h) => h.id === id) : undefined;
  if (id && !habit) return null;
  return <EditorForm key={id ?? 'new'} habit={habit} all={habits.all} activityOn={isOn(d.settings.features, 'activity')} />;
}

function EditorForm({ habit, all, activityOn }: { habit: Habit | undefined; all: Habit[]; activityOn: boolean }) {
  const d = useData();
  const toast = useToast();
  const [draft, setDraft] = useState(() => draftOf(habit, all.length));
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const r = fieldsOf(draft);
  const avoid = draft.kind === 'avoid';

  // The activities to pick from: every kind, and the user's own names used before.
  const choices = useMemo(() => {
    const out: HabitActivity[] = ACTIVITY_KINDS.map((kind) => ({ kind }));
    for (const a of d.activities) {
      const name = a.name?.trim();
      if (name && !out.some((c) => sameActivity(c, { kind: a.kind, name }))) out.push({ kind: a.kind, name });
    }
    for (const p of draft.activities) if (!out.some((c) => sameActivity(c, p))) out.push(p);
    return out;
  }, [d.activities, draft.activities]);

  async function save() {
    if (!r.ok) return;
    if (habit) {
      // Fields of another kind (minutes, activities) must not survive a change of kind.
      const { minutes: _m, activities: _a, quick: _q, ...kept } = habit;
      await repo.updateHabit({ ...kept, ...r.fields });
      toast(t('habits.saved'), () => repo.updateHabit(habit));
      replaceRoute('habits', habit.id);
    } else {
      const added = await repo.addHabit(r.fields);
      toast(t('habits.added'), async () => void (await repo.deleteHabit(added.id)));
      replaceRoute('habits', added.id);
    }
  }

  async function archive() {
    if (!habit) return;
    await repo.updateHabit({ ...habit, archived: !habit.archived });
    toast(t(habit.archived ? 'habits.unarchived' : 'habits.archivedToast'), () => repo.updateHabit(habit));
    replaceRoute('habits', habit.id);
  }

  async function remove() {
    if (!habit) return;
    const old = await repo.deleteHabit(habit.id);
    if (old) toast(t('habits.deleted'), () => repo.restoreHabit(old.habit, old.days));
    navigate('habits');
  }

  async function move(by: -1 | 1) {
    if (!habit) return;
    const ids = all.map((h) => h.id);
    const i = ids.indexOf(habit.id);
    const j = i + by;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    await repo.setHabitOrder(ids);
  }

  const goalLabels: Record<GoalType, MessageKey> = avoid
    ? { daily: 'habits.goal.never', weekdays: 'habits.editor.notOnDays', perWeek: 'habits.editor.atMost' }
    : { daily: 'habits.goal.daily', weekdays: 'habits.editor.onDays', perWeek: 'habits.editor.timesWeek' };
  const position = habit ? all.findIndex((h) => h.id === habit.id) : -1;
  const sunOn = isOn(d.settings.features, 'sunVitaminD');
  // The one-tap activity is one the habit counts: its picks, or any activity when it counts all.
  const quickChoices = draft.activities.length ? draft.activities : choices;
  const setQuick = (patch: Partial<Draft['quick']>) => set({ quick: { ...draft.quick, ...patch } });
  const sameAsQuick = (c: HabitActivity) => sameActivity(c, draft.quick);

  return (
    <section>
      <header className="page-head row">
        <BackButton to={habit ? ['habits', habit.id] : ['habits']} />
        <h1 className="grow">{t(habit ? 'habits.editTitle' : 'habits.newTitle')}</h1>
      </header>
      <div className="card habit-editor" style={habitStyle(draft)}>
        <Field label={t('habits.editor.name')} hint={draft.name.trim().length > CARD_NAME ? t('habits.editor.nameLong') : t('habits.editor.nameHint')}>
          {(id) => <input id={id} type="text" value={draft.name} maxLength={MAX_NAME} placeholder={t('habits.editor.namePlaceholder')} onChange={(e) => set({ name: e.target.value })} />}
        </Field>
        <div className="field">
          <span className="field-label">{t('habits.editor.colour')}</span>
          <div className="habit-colours" role="radiogroup" aria-label={t('habits.editor.colour')}>
            {HABIT_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={c === draft.colour}
                aria-label={t(`habits.colour.${c}` as MessageKey)}
                className={c === draft.colour ? 'habit-colour on' : 'habit-colour'}
                style={habitStyle({ colour: c })}
                onClick={() => set({ colour: c })}
              >
                {c === draft.colour && '✓'}
              </button>
            ))}
          </div>
        </div>
        <Segmented<HabitKind>
          label={t('habits.editor.kind')}
          value={draft.kind}
          onChange={(kind) => set({ kind, times: kind === 'avoid' && (draft.times ?? 0) > 6 ? 6 : draft.times })}
          options={HABIT_KINDS.filter((k) => k !== 'minutes' || activityOn || draft.kind === 'minutes').map((k) => ({ value: k, label: t(`habits.kind.${k}` as MessageKey) }))}
        />
        <p className="muted small">{t(`habits.kindHint.${draft.kind}` as MessageKey)}</p>
        {!activityOn && draft.kind !== 'minutes' && <p className="muted small">{t('habits.editor.minutesNeedActivity')}</p>}

        {draft.kind === 'minutes' && (
          <>
            <Field label={t('habits.editor.minutes')}>{(id) => <NumberInput id={id} value={draft.minutes} onChange={(minutes) => set({ minutes })} suffix="min" min={0} />}</Field>
            <div className="field">
              <span className="field-label">{t('habits.editor.activities')}</span>
              <div className="chips">
                <button type="button" className={draft.activities.length ? 'chip' : 'chip on'} aria-pressed={!draft.activities.length} onClick={() => set({ activities: [] })}>
                  {t('habits.anyActivity')}
                </button>
                {choices.map((c) => {
                  const on = draft.activities.some((p) => sameActivity(p, c));
                  return (
                    <button
                      key={`${c.kind}|${c.name ?? ''}`}
                      type="button"
                      className={on ? 'chip on' : 'chip'}
                      aria-pressed={on}
                      onClick={() => set({ activities: on ? draft.activities.filter((p) => !sameActivity(p, c)) : [...draft.activities, c] })}
                    >
                      {activityName(c)}
                    </button>
                  );
                })}
              </div>
              <div className="field-hint">{t('habits.editor.activitiesHint')}</div>
            </div>
            <Toggle
              checked={draft.quickOn}
              onChange={(quickOn) => set({ quickOn, ...(quickOn && !quickChoices.some(sameAsQuick) ? { quick: { ...quickFor(quickChoices, draft.quick.minutes ?? draft.minutes), sun: draft.quick.sun } } : {}) })}
              label={t('habits.editor.quick')}
              description={t('habits.editor.quickHint')}
            />
            {draft.quickOn && (
              <div className="habit-quick">
                <div className="chips" role="radiogroup" aria-label={t('habits.editor.quickWhat')}>
                  {quickChoices.map((c) => {
                    const on = sameAsQuick(c);
                    return (
                      <button
                        key={`${c.kind}|${c.name ?? ''}`}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        className={on ? 'chip on' : 'chip'}
                        onClick={() => setQuick({ kind: c.kind, name: c.name, ...(OUTSIDE_KINDS.has(c.kind) ? { outside: true } : {}) })}
                      >
                        {activityName(c)}
                      </button>
                    );
                  })}
                </div>
                <Field label={t('habits.editor.quickMinutes')}>{(id) => <NumberInput id={id} value={draft.quick.minutes} onChange={(minutes) => setQuick({ minutes })} suffix="min" min={0} />}</Field>
                <Segmented<Intensity>
                  label={t('activity.howHard')}
                  value={draft.quick.intensity}
                  onChange={(intensity) => setQuick({ intensity })}
                  options={INTENSITIES.map((i) => ({ value: i, label: t(`activity.intensity.${i}` as MessageKey) }))}
                />
                <Toggle checked={draft.quick.outside} onChange={(outside) => setQuick({ outside })} label={t('activity.outside')} />
                {draft.quick.outside && sunOn && <Toggle checked={draft.quick.sun} onChange={(sun) => setQuick({ sun })} label={t('activity.sun')} description={t('activity.sunHint')} />}
              </div>
            )}
          </>
        )}

        <Segmented<GoalType>
          label={t('habits.editor.goal')}
          value={draft.goalType}
          onChange={(goalType) => set({ goalType })}
          options={(['daily', 'weekdays', 'perWeek'] as const).map((g) => ({ value: g, label: t(goalLabels[g]) }))}
        />
        {draft.goalType === 'weekdays' && (
          <div className="chips habit-weekdays" role="group" aria-label={t('habits.editor.onDays')}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => {
              const on = draft.days.includes(n);
              return (
                <button key={n} type="button" className={on ? 'chip on' : 'chip'} aria-pressed={on} onClick={() => set({ days: on ? draft.days.filter((x) => x !== n) : [...draft.days, n] })}>
                  {weekdayName(n)}
                </button>
              );
            })}
          </div>
        )}
        {draft.goalType === 'perWeek' && (
          <Field label={t(avoid ? 'habits.editor.atMostDays' : 'habits.editor.daysAWeek')}>
            {(id) => <NumberInput id={id} value={draft.times} onChange={(times) => set({ times })} suffix={t('habits.editor.perWeekSuffix')} min={0} step="1" />}
          </Field>
        )}
        {!r.ok && (
          <p className="notice small" role="alert">
            {t(r.problem)}
          </p>
        )}
        <div className="sheet-actions">
          <button className="btn btn-primary" disabled={!r.ok} onClick={() => void save()}>
            {t('common.save')}
          </button>
        </div>
      </div>

      {habit && (
        <div className="card">
          {all.length > 1 && (
            <div className="row-between tracker-row">
              <span>{t('habits.editor.position', { n: position + 1, of: all.length })}</span>
              <span className="row">
                <button className="btn btn-small" disabled={position <= 0} onClick={() => void move(-1)}>
                  {t('habits.editor.earlier')}
                </button>
                <button className="btn btn-small" disabled={position >= all.length - 1} onClick={() => void move(1)}>
                  {t('habits.editor.later')}
                </button>
              </span>
            </div>
          )}
          <div className="prompt-actions">
            <button className="btn btn-small" onClick={() => void archive()}>
              {t(habit.archived ? 'habits.editor.unarchive' : 'habits.editor.archive')}
            </button>
            <button className="btn btn-small btn-ghost" onClick={() => void remove()}>
              {t('habits.editor.delete')}
            </button>
          </div>
          <p className="muted small">{t('habits.editor.archiveHint')}</p>
        </div>
      )}
    </section>
  );
}
