import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { MAX_WATER_ML } from '../../logic/water';
import { repo } from '../../storage/repo';
import type { WaterRecord } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { TimeField } from '../log/TimeField';
import { waterText } from './format';

const PRESETS = [150, 250, 330, 500, 750, 1000];

/** Problem with an amount of water, or undefined if it is fine. */
export function waterProblem(ml: number | undefined): string | undefined {
  if (!ml || ml <= 0) return t('water.problem.empty');
  if (ml > MAX_WATER_ML) return t('water.problem.much');
  return undefined;
}

/** Log plain water now (or at `time`), with undo. */
export async function addWaterWithUndo(ml: number, time: number, toast: ReturnType<typeof useToast>) {
  const added = await repo.addWater({ ml, time, day: dayKey(new Date(time)) });
  toast(t('water.added', { amount: waterText(ml) }), () => void repo.deleteWater(added.id));
}

/** Add plain water (at `defaultTime`), or edit or delete an entry, with undo. */
export function WaterSheet({ record, defaultTime, onClose }: { record?: WaterRecord; defaultTime: number; onClose: () => void }) {
  const toast = useToast();
  const [ml, setMl] = useState<number | undefined>(record?.ml ?? 250);
  const [time, setTime] = useState(record?.time ?? defaultTime);
  const problem = waterProblem(ml) ?? (time > Date.now() + 60_000 ? t('water.problem.future') : undefined);

  async function save() {
    if (problem || !ml) return;
    if (record) {
      await repo.updateWater({ ...record, ml: Math.round(ml), time, day: dayKey(new Date(time)) });
      toast(t('water.updated'), () => repo.restoreWater(record));
    } else await addWaterWithUndo(Math.round(ml), time, toast);
    onClose();
  }

  async function remove() {
    if (!record) return;
    const old = await repo.deleteWater(record.id);
    if (old) toast(t('water.deleted'), () => repo.restoreWater(old));
    onClose();
  }

  return (
    <Sheet title={t(record ? 'water.editTitle' : 'water.addTitle')} onClose={onClose}>
      <div className="chips" role="group" aria-label={t('water.presets')}>
        {PRESETS.map((p) => (
          <button key={p} type="button" className={`chip${ml === p ? ' on' : ''}`} aria-pressed={ml === p} onClick={() => setMl(p)}>
            {waterText(p)}
          </button>
        ))}
      </div>
      <Field label={t('water.amount')}>{(id) => <NumberInput id={id} value={ml} onChange={setMl} suffix="ml" min={0} />}</Field>
      <TimeField value={time} onChange={setTime} />
      <p className="muted small">{t('water.plainHint')}</p>
      {problem && (
        <p className="notice small" role="alert">
          {problem}
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
