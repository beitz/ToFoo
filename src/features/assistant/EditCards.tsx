import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { formatDateTime, formatDay } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { applyEdit, type RecentRecord } from '../../logic/edits';
import type { EditTarget } from '../../ai/edits';
import { Icon } from '../../ui/Icon';
import { activityName } from '../activity/ActivityForm';
import { bpText } from '../bloodPressure/format';
import { ketoneValueText } from '../fast/ketoneFormat';
import { durationText } from '../sleep/format';
import { waterText } from '../water/format';
import { fmtKg } from '../weight/format';
import { ChangeButton, DoneRow } from './CardFrame';
import { targetNames, TARGET_KIND, useRegister, type Card, type CardProps, type Undo } from './cards';
import { deleteRecord, readTarget, saveChanged } from './editStore';

/** One line of an entry as the card shows it: what it is ("Amount") and its value. */
interface Row {
  label: MessageKey;
  value: string;
}

const HABIT_ANSWER = { do: ['edit.habitNotDone', 'edit.habitDone'], avoid: ['edit.habitNone', 'edit.habitHad'] } as const;

/** What an entry is called on the card, and its values, in the same order for before and after. */
export function describeEntry(r: RecentRecord, today: string): { title: string; rows: Row[] } {
  switch (r.kind) {
    case 'log': {
      const e = r.rec;
      const amount =
        e.kind === 'food'
          ? `${fmtNumber(e.grams, 1)} g${e.pieces ? ` · ${t('edit.pieces', { n: e.pieces })}` : ''}`
          : e.kind === 'portion'
            ? e.grams
              ? `${fmtNumber(e.grams, 1)} g`
              : t('edit.portions', { n: fmtNumber(e.portions, 1) })
            : e.kind === 'custom'
              ? t('edit.servings', { n: fmtNumber(e.servings, 1) })
              : '';
      return { title: e.label, rows: [...(amount ? [{ label: 'edit.amount' as const, value: amount }] : []), { label: 'edit.time', value: formatDateTime(e.time, today) }] };
    }
    case 'journal':
      return { title: t('edit.kind.journal'), rows: [{ label: 'edit.text', value: r.rec.text }, { label: 'edit.time', value: formatDateTime(r.rec.time, today) }] };
    case 'sleep': {
      const s = r.rec;
      return {
        title: t('edit.kind.sleep'),
        rows: [
          { label: 'sleep.fellAsleep', value: formatDateTime(s.start, today) },
          { label: 'sleep.wokeUp', value: s.end !== undefined ? formatDateTime(s.end, today) : t('edit.stillAsleep') },
          ...(s.end !== undefined ? [{ label: 'edit.length' as const, value: durationText(s.end - s.start) }] : []),
        ],
      };
    }
    case 'activity': {
      const a = r.rec;
      return {
        title: activityName(a),
        rows: [
          { label: 'edit.start', value: formatDateTime(a.time, today) },
          { label: 'edit.length', value: t('edit.minutes', { n: a.minutes }) },
          ...(a.intensity ? [{ label: 'edit.effort' as const, value: t(`activity.intensity.${a.intensity}`) }] : []),
        ],
      };
    }
    case 'water':
      return { title: t('edit.kind.water'), rows: [{ label: 'edit.amount', value: waterText(r.rec.ml) }, { label: 'edit.time', value: formatDateTime(r.rec.time, today) }] };
    case 'weight':
      return { title: t('edit.kind.weight'), rows: [{ label: 'edit.weight', value: t('weight.kg', { kg: fmtKg(r.rec.kg) }) }, { label: 'edit.day', value: formatDay(r.rec.day, today) }] };
    case 'bloodPressure':
      return {
        title: t('edit.kind.bloodPressure'),
        rows: [
          { label: 'edit.reading', value: `${bpText(r.rec)} mmHg` },
          ...(r.rec.pulse ? [{ label: 'edit.pulse' as const, value: String(r.rec.pulse) }] : []),
          { label: 'edit.time', value: formatDateTime(r.rec.time, today) },
        ],
      };
    case 'ketone':
      return { title: t('edit.kind.ketone'), rows: [{ label: 'edit.value', value: ketoneValueText(r.rec) }, { label: 'edit.time', value: formatDateTime(r.rec.time, today) }] };
    case 'habit':
      return {
        title: r.habit.name,
        rows: [
          { label: 'edit.answer', value: t(HABIT_ANSWER[r.habit.kind === 'avoid' ? 'avoid' : 'do'][r.rec.did ? 1 : 0]) },
          { label: 'edit.day', value: formatDay(r.rec.day, today) },
        ],
      };
  }
}

/** When an entry is, as the card says it above its changes ("Wed 18.11., 08:10"). */
const WHEN_LABELS: MessageKey[] = ['edit.time', 'edit.start', 'sleep.fellAsleep', 'edit.day'];
function whenOf(rows: readonly Row[]): string {
  return rows.find((r) => WHEN_LABELS.includes(r.label))?.value ?? '';
}

/** The lines that differ between before and after, in the order shown ("–" for a value that is not there). */
export function changedRows(before: readonly Row[], after: readonly Row[]): Array<{ label: MessageKey; from: string; to: string }> {
  const labels = [...new Set([...before, ...after].map((r) => r.label))];
  return labels.flatMap((label) => {
    const from = before.find((r) => r.label === label)?.value ?? '–';
    const to = after.find((r) => r.label === label)?.value ?? '–';
    return from === to ? [] : [{ label, from, to }];
  });
}

/** The entries a card points at as they are saved now (undefined while loading; a missing one is gone). */
function useTargets(targets: readonly Pick<EditTarget, 'ref' | 'kind' | 'id'>[]): Map<string, RecentRecord | undefined> | undefined {
  const d = useData();
  const key = targets.map((x) => `${x.kind}:${x.id}`).join(',');
  // Weigh-ins live in the profile: read again when it changes.
  const weights = d.profile.weightHistory;
  return useLiveQuery(
    async () => new Map(await Promise.all(targets.map(async (x) => [x.ref, await readTarget(x)] as const))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, weights],
  );
}

/** "Diary" for a day an entry is on: the place to look at it after the change. */
function DiaryLink({ day }: { day: string }) {
  return <a href={href('diary', day)}>{t('edit.openDiary')}</a>;
}

/**
 * A change to entries already saved (C1, …), proposed by the assistant from the recent days list:
 * each entry with only what changes, before and after. Nothing changes until the user taps Change,
 * and Undo puts the entries back as they were (owner's ask, 2026-11-19: no change without consent).
 */
export function ChangeCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'change' }>>) {
  const { change } = card;
  const d = useData();
  const now = useTargets(change.edits);
  const [saving, setSaving] = useState(false);
  const gone = now ? change.edits.filter((e) => !now.get(e.ref)) : [];
  const valid = !!now && gone.length < change.edits.length;

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    const undos: Array<() => Promise<void>> = [];
    try {
      // Each entry as it is saved right now, so an edit made meanwhile elsewhere is kept.
      for (const e of change.edits) {
        const before = await readTarget(e);
        if (before) undos.push(await saveChanged(before, applyEdit(before, e.patch)));
      }
    } finally {
      setSaving(false);
    }
    if (!undos.length) return;
    onLogged(true, { changed: change.edits.map((e) => e.ref) });
    return async () => {
      for (const u of [...undos].reverse()) await u();
      onLogged(false);
    };
  }
  useRegister(change.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('edit.changedToast', { what: targetNames(change.edits) }), undo);
  }

  const days = [...new Set(change.edits.map((e) => e.day))];
  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('edit.changedDone', { what: targetNames(change.edits) })} {days.length === 1 && <DiaryLink day={days[0]!} />}
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal edit-card">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="edit" size={18} /> {t('edit.changeTitle')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {change.id}
        </span>
      </div>
      {change.reason && <p>{change.reason}</p>}
      {!now ? (
        <p className="muted small">{t('common.loading')}</p>
      ) : (
        <ul className="plain-list edit-list">
          {change.edits.map((e) => {
            const before = now.get(e.ref);
            if (!before) return <GoneRow key={e.ref} target={e} />;
            const was = describeEntry(before, d.today);
            const will = describeEntry(applyEdit(before, e.patch), d.today);
            return (
              <li key={e.ref} className="edit-entry">
                <strong>{was.title}</strong>
                <span className="muted small block">{whenOf(was.rows)}</span>
                <dl className="edit-rows small">
                  {changedRows(was.rows, will.rows).map((row) => (
                    <div key={row.label} className="edit-row">
                      <dt className="muted">{t(row.label)}</dt>
                      <dd>
                        <span className="edit-old">{row.from}</span> <span aria-label={t('edit.becomes')}>→</span> <strong>{row.to}</strong>
                      </dd>
                    </div>
                  ))}
                </dl>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">{t('edit.undoHint')}</p>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void saveOne()}>
          {t('edit.change')}
        </button>
      </div>
    </div>
  );
}

/** An entry the card points at that is no longer saved: said in words, with nothing to do. */
function GoneRow({ target }: { target: EditTarget }) {
  const d = useData();
  return (
    <li className="edit-entry">
      <span className="notice small">
        <Icon name="alert" size={16} /> {t('edit.gone', { what: target.kind === 'log' || target.kind === 'habit' ? target.name : t(TARGET_KIND[target.kind]), day: formatDay(target.day, d.today) })}
      </span>
    </li>
  );
}

/**
 * Entries already saved to delete (X1, …), proposed by the assistant from the recent days list.
 * Each is listed as it is saved; nothing goes until the user taps Delete, and Undo brings them back.
 */
export function DeleteCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'delete' }>>) {
  const { remove } = card;
  const d = useData();
  const now = useTargets(remove.targets);
  const [saving, setSaving] = useState(false);
  const gone = now ? remove.targets.filter((x) => !now.get(x.ref)) : [];
  const valid = !!now && gone.length < remove.targets.length;
  const days = [...new Set(remove.targets.map((x) => x.day))];

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    const undos: Array<() => Promise<void>> = [];
    try {
      for (const x of remove.targets) {
        const rec = await readTarget(x);
        if (rec) undos.push(await deleteRecord(rec));
      }
    } finally {
      setSaving(false);
    }
    if (!undos.length) return;
    onLogged(true, { deleted: remove.targets.map((x) => x.ref) });
    return async () => {
      for (const u of [...undos].reverse()) await u();
      onLogged(false);
    };
  }
  useRegister(remove.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('edit.deletedToast', { what: targetNames(remove.targets) }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('edit.deletedDone', { what: targetNames(remove.targets) })} {days.length === 1 && <DiaryLink day={days[0]!} />}
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal edit-card">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="trash" size={18} /> {t('edit.deleteTitle')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {remove.id}
        </span>
      </div>
      {remove.reason && <p>{remove.reason}</p>}
      {!now ? (
        <p className="muted small">{t('common.loading')}</p>
      ) : (
        <ul className="plain-list edit-list">
          {remove.targets.map((x) => {
            const rec = now.get(x.ref);
            if (!rec) return <GoneRow key={x.ref} target={x} />;
            const { title, rows } = describeEntry(rec, d.today);
            return (
              <li key={x.ref} className="edit-entry">
                <strong>{title}</strong>
                <span className="muted small block">{rows.map((r) => (r.label === 'edit.text' ? `“${r.value.length > 80 ? `${r.value.slice(0, 79)}…` : r.value}”` : r.value)).join(' · ')}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className="muted small">{t('edit.undoHint')}</p>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void saveOne()}>
          <Icon name="trash" size={18} /> {t('edit.delete')}
        </button>
      </div>
    </div>
  );
}
