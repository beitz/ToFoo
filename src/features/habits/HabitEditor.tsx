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
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { activityName } from '../activity/ActivityForm';
import { habitStyle, MarkGlyph, quickText, weekdayName } from './HabitParts';
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

/** What a tap logs for this activity before the user changes it: a walk is easy, walking, running and cycling are outside. */
const presetOf = (a: HabitActivity): Pick<HabitQuickLog, 'kind' | 'name' | 'intensity' | 'outside'> => ({
  kind: a.kind,
  name: a.name,
  intensity: a.kind === 'walk' ? 'easy' : 'moderate',
  outside: OUTSIDE_KINDS.has(a.kind),
});

/** A first preset: the habit's first activity (else a walk) for its minutes. */
function quickFor(activities: HabitActivity[], minutes: number | undefined): Draft['quick'] {
  return { ...presetOf(activities[0] ?? { kind: 'walk' }), minutes, sun: true };
}

const sameActivity = (a: HabitActivity, b: HabitActivity) => a.kind === b.kind && (a.name ?? '').toLowerCase() === (b.name ?? '').toLowerCase();

/**
 * The picks under "What counts", with the one-tap activity kept among them: a habit that counts one
 * activity logs that one (no second choice to make), and one dropped from the picks is replaced.
 */
function withActivities(d: Draft, activities: HabitActivity[]): Partial<Draft> {
  const first = activities[0];
  if (!first || activities.some((a) => sameActivity(a, d.quick))) return { activities };
  return { activities, quick: { ...d.quick, ...presetOf(first) } };
}

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
        <Preview draft={draft} />
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
        <div className="field">
          <span className="field-label">{t('habits.editor.kind')}</span>
          <Segmented<HabitKind>
            label={t('habits.editor.kind')}
            value={draft.kind}
            onChange={(kind) => set({ kind, times: kind === 'avoid' && (draft.times ?? 0) > 6 ? 6 : draft.times })}
            options={HABIT_KINDS.filter((k) => k !== 'minutes' || activityOn || draft.kind === 'minutes').map((k) => ({ value: k, label: t(`habits.kind.${k}` as MessageKey) }))}
          />
          <div className="field-hint">{t(`habits.kindHint.${draft.kind}` as MessageKey)}</div>
        </div>
        {!activityOn && draft.kind !== 'minutes' && <p className="muted small">{t('habits.editor.minutesNeedActivity')}</p>}

        {draft.kind === 'minutes' && (
          <>
            <Field label={t('habits.editor.minutes')}>{(id) => <NumberInput id={id} value={draft.minutes} onChange={(minutes) => set({ minutes })} suffix="min" min={0} />}</Field>
            <div className="field">
              <span className="field-label">{t('habits.editor.activities')}</span>
              <div className="chips">
                <button type="button" className={draft.activities.length ? 'chip' : 'chip on'} aria-pressed={!draft.activities.length} onClick={() => set(withActivities(draft, []))}>
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
                      onClick={() => set(withActivities(draft, on ? draft.activities.filter((p) => !sameActivity(p, c)) : [...draft.activities, c]))}
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
              onChange={(quickOn) => set({ quickOn, ...(quickOn && !quickChoices.some(sameAsQuick) ? { quick: { ...draft.quick, ...presetOf(quickChoices[0] ?? { kind: 'walk' }) } } : {}) })}
              label={t('habits.editor.quick')}
              description={t('habits.editor.quickHint')}
            />
            {draft.quickOn && (
              <div className="habit-quick">
                <Field label={t('habits.editor.quickMinutes')}>{(id) => <NumberInput id={id} value={draft.quick.minutes} onChange={(minutes) => setQuick({ minutes })} suffix="min" min={0} />}</Field>
                {/* Only when the habit counts more than one activity is there a choice to make. */}
                {draft.activities.length !== 1 && (
                  <div className="field">
                    <span className="field-label">{t('habits.editor.quickWhat')}</span>
                    <div className="chips" role="radiogroup" aria-label={t('habits.editor.quickWhat')}>
                      {quickChoices.map((c) => {
                        const on = sameAsQuick(c);
                        return (
                          <button key={`${c.kind}|${c.name ?? ''}`} type="button" role="radio" aria-checked={on} className={on ? 'chip on' : 'chip'} onClick={() => setQuick(presetOf(c))}>
                            {activityName(c)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                <details className="fold habit-quick-more">
                  <summary>
                    <span className="grow">{detailsText(draft.quick, sunOn)}</span>
                    <Icon name="down" size={18} />
                  </summary>
                  <div className="fold-body habit-quick-body">
                    <div className="field">
                      <span className="field-label">{t('activity.howHard')}</span>
                      <Segmented<Intensity>
                        label={t('activity.howHard')}
                        value={draft.quick.intensity}
                        onChange={(intensity) => setQuick({ intensity })}
                        options={INTENSITIES.map((i) => ({ value: i, label: t(`activity.intensity.${i}` as MessageKey) }))}
                      />
                    </div>
                    <Toggle checked={draft.quick.outside} onChange={(outside) => setQuick({ outside })} label={t('activity.outside')} />
                    {draft.quick.outside && sunOn && (
                      <div className="row habit-sun">
                        <div className="grow">
                          <Toggle checked={draft.quick.sun} onChange={(sun) => setQuick({ sun })} label={t('activity.sun')} />
                        </div>
                        <InfoButton title={t('activity.sun')}>
                          <p>{t('activity.sunHint')}</p>
                        </InfoButton>
                      </div>
                    )}
                  </div>
                </details>
              </div>
            )}
          </>
        )}

        <div className="field">
          <span className="field-label">{t('habits.editor.goal')}</span>
          <Segmented<GoalType>
            label={t('habits.editor.goal')}
            value={draft.goalType}
            onChange={(goalType) => set({ goalType })}
            options={(['daily', 'weekdays', 'perWeek'] as const).map((g) => ({ value: g, label: t(goalLabels[g]) }))}
          />
        </div>
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

/** The folded line under the one-tap minutes: "Easy · outside · vitamin D". */
function detailsText(q: Draft['quick'], sunOn: boolean): string {
  const parts = [t(`activity.intensity.${q.intensity}` as MessageKey), t(q.outside ? 'habits.editor.outside' : 'habits.editor.inside')];
  if (q.outside && sunOn && q.sun) parts.push(t('habits.editor.sunCounts'));
  return parts.join(' · ');
}

/** The habit's Home card as it will look today, and what a tap on it does, so the form shows rather than explains. */
function Preview({ draft }: { draft: Draft }) {
  const weekly = draft.goalType === 'perWeek';
  const value =
    weekly && draft.kind === 'avoid' ? t('habits.card.max', { n: 0, max: draft.times ?? 0 }) : weekly ? `0/${draft.times ?? 0}` : draft.kind === 'minutes' ? `0/${draft.minutes ?? 0}′` : <MarkGlyph mark="open" />;
  const q = draft.quick;
  const tap =
    draft.kind !== 'minutes'
      ? t(draft.kind === 'avoid' ? 'habits.editor.tapAvoid' : 'habits.editor.tapDo')
      : draft.quickOn && q.minutes
        ? t('habits.editor.tapQuick', { what: quickText({ ...q, minutes: q.minutes }) })
        : t('habits.editor.tapSheet');
  return (
    <div className="habit-preview">
      <span className="habit-card" style={habitStyle(draft)} aria-hidden>
        <span className="habit-card-name">{draft.name.trim() || '…'}</span>
        <span className="habit-card-value">{value}</span>
      </span>
      <span className="muted small">
        {t('habits.editor.onHome')}
        <br />
        {tap}
      </span>
    </div>
  );
}
