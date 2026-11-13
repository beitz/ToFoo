import { useState } from 'react';
import { homeProtocol } from '../../../model/blood-pressure';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { bpProblem } from '../../logic/bloodPressure';
import { repo } from '../../storage/repo';
import type { BloodPressureReading } from '../../storage/types';
import { NumberInput, Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { TimeField } from '../log/TimeField';
import { bpText } from './format';

/** At most this many readings at one sitting: the protocol's two, and a third when the first two differ a lot. */
export const MAX_PER_SITTING = 3;

export interface ReadingInput {
  systolic?: number;
  diastolic?: number;
  pulse?: number;
}

/** The problem with any of the readings or the time, as a message; undefined when all can be saved. */
export function readingsProblem(rows: readonly ReadingInput[], time: number, now: number): string | undefined {
  for (const [i, r] of rows.entries()) {
    const p = bpProblem(r);
    if (p) return t(`bp.problem.${p}` as MessageKey, { n: i + 1 });
  }
  if (time > now + 60_000) return t('bp.problem.future');
  return undefined;
}

/** Save the readings of one sitting at `time`, with undo. */
export async function addBloodPressureWithUndo(rows: readonly ReadingInput[], time: number, toast: ReturnType<typeof useToast>): Promise<BloodPressureReading[]> {
  const added = await repo.addBloodPressure(
    rows.map((r) => ({ time, day: dayKey(new Date(time)), systolic: Math.round(r.systolic!), diastolic: Math.round(r.diastolic!), ...(r.pulse !== undefined ? { pulse: Math.round(r.pulse) } : {}) })),
  );
  toast(t(added.length === 1 ? 'bp.addedOne' : 'bp.added', { value: added.map(bpText).join(', ') }), () => void repo.deleteBloodPressure(added.map((r) => r.id)));
  return added;
}

/** Systolic, diastolic and pulse of one reading, side by side. */
export function ReadingRow({ n, value, onChange, onRemove }: { n?: number; value: ReadingInput; onChange: (v: ReadingInput) => void; onRemove?: () => void }) {
  const label = (key: MessageKey) => (n ? `${t(key)} ${n}` : t(key));
  return (
    <div className="bp-row" role="group" aria-label={n ? t('bp.readingN', { n }) : t('bp.reading')}>
      <label className="bp-field">
        <span className="small muted">{t('bp.sys')}</span>
        <NumberInput value={value.systolic} onChange={(systolic) => onChange({ ...value, systolic })} min={0} step="1" placeholder="120" />
        <span className="visually-hidden">{label('bp.systolic')}</span>
      </label>
      <span className="bp-slash" aria-hidden>
        /
      </span>
      <label className="bp-field">
        <span className="small muted">{t('bp.dia')}</span>
        <NumberInput value={value.diastolic} onChange={(diastolic) => onChange({ ...value, diastolic })} min={0} step="1" placeholder="80" />
        <span className="visually-hidden">{label('bp.diastolic')}</span>
      </label>
      <label className="bp-field">
        <span className="small muted">{t('bp.pulse')}</span>
        <NumberInput value={value.pulse} onChange={(pulse) => onChange({ ...value, pulse })} min={0} step="1" placeholder="–" />
        <span className="visually-hidden">{label('bp.pulseLong')}</span>
      </label>
      {onRemove && (
        <button type="button" className="icon-btn" onClick={onRemove} aria-label={t('bp.removeReading', { n: n ?? 1 })}>
          <Icon name="close" size={18} />
        </button>
      )}
    </div>
  );
}

/**
 * Add the readings of one sitting (one, or the protocol's two a minute apart), or edit or delete one
 * reading, with undo. docs/SPEC.md, "Blood pressure".
 */
export function BloodPressureSheet({ record, defaultTime, onClose }: { record?: BloodPressureReading; defaultTime: number; onClose: () => void }) {
  const toast = useToast();
  const [rows, setRows] = useState<ReadingInput[]>(record ? [{ systolic: record.systolic, diastolic: record.diastolic, pulse: record.pulse }] : [{}]);
  const [time, setTime] = useState(record?.time ?? defaultTime);
  const problem = readingsProblem(rows, time, Date.now());
  // Only once something is typed: an empty new sheet says how to measure, not what is missing.
  const shownProblem = rows.some((r) => r.systolic !== undefined || r.diastolic !== undefined) ? problem : undefined;
  const p = homeProtocol.value;

  async function save() {
    if (problem) return;
    if (record) {
      const r = rows[0]!;
      await repo.updateBloodPressure({ ...record, time, day: dayKey(new Date(time)), systolic: Math.round(r.systolic!), diastolic: Math.round(r.diastolic!), pulse: r.pulse !== undefined ? Math.round(r.pulse) : undefined });
      toast(t('bp.updated'), () => repo.restoreBloodPressure([record]));
    } else await addBloodPressureWithUndo(rows, time, toast);
    onClose();
  }

  async function remove() {
    if (!record) return;
    const old = await repo.deleteBloodPressure([record.id]);
    if (old.length) toast(t('bp.deleted'), () => repo.restoreBloodPressure(old));
    onClose();
  }

  const set = (i: number, v: ReadingInput) => setRows((rs) => rs.map((r, j) => (j === i ? v : r)));
  return (
    <Sheet title={t(record ? 'bp.editTitle' : 'bp.addTitle')} onClose={onClose}>
      {rows.map((r, i) => (
        <ReadingRow key={i} n={rows.length > 1 ? i + 1 : undefined} value={r} onChange={(v) => set(i, v)} onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((_, j) => j !== i)) : undefined} />
      ))}
      {!record && rows.length < MAX_PER_SITTING && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setRows((rs) => [...rs, {}])}>
          <Icon name="plus" size={16} /> {t(rows.length === 1 ? 'bp.addSecond' : 'bp.addAnother')}
        </button>
      )}
      <TimeField value={time} onChange={setTime} label={t('bp.time')} />
      {!record && <p className="muted small">{t('bp.howShort', { rest: p.restMinutes, n: p.perSitting, gap: p.gapMinutes })}</p>}
      {shownProblem && (
        <p className="notice small" role="alert">
          {shownProblem}
        </p>
      )}
      <div className="sheet-actions">
        {record && (
          <button className="btn btn-ghost" onClick={() => void remove()}>
            {t('common.delete')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!!problem} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
