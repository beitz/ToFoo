import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import { TimeField } from '../log/TimeField';
import { readingsProblem, ReadingRow, type ReadingInput } from '../bloodPressure/BloodPressureSheet';
import { bpText } from '../bloodPressure/format';
import { ChangeButton, DoneRow } from './CardFrame';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/** Blood pressure readings the user told the assistant or showed on a photo of the cuff (D1, …): check each and the time, then save. */
export function BloodPressureProposalCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'bloodPressure' }>>) {
  const { pressure } = card;
  const d = useData();
  const [rows, setRows] = useState<ReadingInput[]>(() => pressure.readings.map((r) => ({ ...r })));
  const [time, setTime] = useState(() => pressure.time ?? defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);
  const problem = readingsProblem(rows, time, Date.now());

  async function save(): Promise<Undo | undefined> {
    if (problem || saving) return;
    setSaving(true);
    try {
      const added = await repo.addBloodPressure(
        rows.map((r) => ({ time, day: dayKey(new Date(time)), systolic: Math.round(r.systolic!), diastolic: Math.round(r.diastolic!), ...(r.pulse !== undefined ? { pulse: Math.round(r.pulse) } : {}) })),
      );
      onLogged(true, { readings: rows, time });
      return async () => {
        await repo.deleteBloodPressure(added.map((r) => r.id));
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(pressure.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t(rows.length === 1 ? 'bp.addedOne' : 'bp.added', { value: rows.map((r) => bpText({ systolic: r.systolic!, diastolic: r.diastolic! })).join(', ') }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('ai.bpSaved', { value: rows.map((r) => bpText({ systolic: r.systolic ?? 0, diastolic: r.diastolic ?? 0 })).join(', '), when: `${formatDay(dayKey(new Date(time)), d.today)}, ${formatTime(time)}` })} <a href={href('blood-pressure')}>{t('ai.bpOpen')}</a>
        </span>
      </DoneRow>
    );
  }

  const set = (i: number, v: ReadingInput) => setRows((rs) => rs.map((r, j) => (j === i ? v : r)));
  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="heart" size={18} /> {t('bp.title')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {pressure.id}
        </span>
      </div>
      {rows.map((r, i) => (
        <ReadingRow key={i} n={rows.length > 1 ? i + 1 : undefined} value={r} onChange={(v) => set(i, v)} onRemove={rows.length > 1 ? () => setRows((rs) => rs.filter((_, j) => j !== i)) : undefined} />
      ))}
      <TimeField value={time} onChange={setTime} label={t('bp.time')} />
      {problem && (
        <p className="notice small" role="alert">
          {problem}
        </p>
      )}
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!!problem || saving} onClick={() => void saveOne()}>
          {t('ai.saveBp')}
        </button>
      </div>
    </div>
  );
}
