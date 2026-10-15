import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { t } from '../../i18n';
import type { Food } from '../../foods/foodDb';
import { fmtNumber } from '../../lib/format';
import { dayKey } from '../../lib/dates';
import type { Preparation } from '../../model/paramTypes';
import type { EntryConfidence } from '../../model/types';
import { repo } from '../../storage/repo';
import type { LogEntry } from '../../storage/types';
import { Field, NumberInput, Sheet } from '../../ui/controls';
import { ConfidenceField } from './ConfidenceField';
import { TimeField } from './TimeField';
import { PreparationSelect } from './PreparationSelect';

export interface PortionHelper {
  label: string;
  grams: number;
}

/** Pick an amount of a BLS food and log it. */
export function AmountSheet({ food, day, time: initialTime, onClose, onAdded }: { food: Food; day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const helpers = useLiveQuery(() => repo.getMeta<PortionHelper[]>(`portions:${food.code}`), [food.code]) ?? [];
  const last = useLiveQuery(() => repo.getMeta<number>(`lastGrams:${food.code}`), [food.code]);
  const [grams, setGrams] = useState<number>();
  const [prep, setPrep] = useState<Preparation>('asListed');
  const [confidence, setConfidence] = useState<EntryConfidence>('A');
  const [time, setTime] = useState(initialTime);
  const [helperName, setHelperName] = useState('');
  const kcal = typeof food.per100.ENERCC === 'number' && grams ? (food.per100.ENERCC * grams) / 100 : undefined;
  const chips: PortionHelper[] = [...helpers, ...(last ? [{ label: t('log.lastTime'), grams: last }] : []), { label: '50 g', grams: 50 }, { label: '100 g', grams: 100 }, { label: '200 g', grams: 200 }];

  async function save() {
    if (!grams) return;
    const entry = await repo.addLog({
      kind: 'food',
      ref: { source: 'BLS', version: '4.0', code: food.code },
      grams,
      preparation: prep,
      time,
      day: time ? dayKey(new Date(time)) : day,
      confidence,
      label: food.nameEn,
    });
    await repo.setMeta(`lastGrams:${food.code}`, grams);
    onAdded(entry);
  }

  async function saveHelper() {
    if (!grams || !helperName.trim()) return;
    await repo.setMeta(`portions:${food.code}`, [...helpers.filter((h) => h.label !== helperName.trim()), { label: helperName.trim(), grams }]);
    setHelperName('');
  }

  return (
    <Sheet title={food.nameEn} onClose={onClose}>
      <p className="muted small">
        {food.nameDe} · <a href={`#/food/${food.code}`}>{t('log.details')}</a>
      </p>
      <Field label={t('log.amount')}>
        {(id) => <NumberInput id={id} value={grams} onChange={setGrams} placeholder="0" suffix="g" min={0} autoFocus />}
      </Field>
      <div className="chips">
        {chips.map((c) => (
          <button key={`${c.label}-${c.grams}`} className={`chip${grams === c.grams ? ' on' : ''}`} onClick={() => setGrams(c.grams)}>
            {c.label === `${c.grams} g` ? c.label : `${c.label} (${fmtNumber(c.grams, 1)} g)`}
          </button>
        ))}
      </div>
      {grams ? (
        <div className="row helper-row">
          <input className="small-input" placeholder={t('log.portionName')} value={helperName} onChange={(e) => setHelperName(e.target.value)} aria-label={t('log.portionName')} />
          <button className="btn btn-small btn-ghost" disabled={!helperName.trim()} onClick={() => void saveHelper()}>
            {t('log.savePortion')}
          </button>
        </div>
      ) : null}
      <PreparationSelect value={prep} onChange={setPrep} />
      <ConfidenceField value={confidence} onChange={setConfidence} />
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        {kcal !== undefined && <span className="muted">{fmtNumber(kcal)} kcal</span>}
        <button className="btn btn-primary" disabled={!grams} onClick={() => void save()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
