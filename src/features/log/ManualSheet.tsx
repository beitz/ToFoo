import { useState } from 'react';
import { t } from '../../i18n';
import { dayKey, formatDateTime } from '../../lib/dates';
import { NUTRIENTS, NUTRIENT_BY_ID } from '../../model/nutrients';
import type { EntryConfidence } from '../../model/types';
import { repo } from '../../storage/repo';
import type { LogEntry } from '../../storage/types';
import { Field, NumberInput, Segmented, Sheet, Toggle } from '../../ui/controls';
import { ConfidenceField } from './ConfidenceField';

const FOOD_FIELDS = ['ENERCC', 'PROT625', 'FAT', 'FASAT', 'CHO', 'SUGAR', 'FIBT'];
const SUPPLEMENT_FIELDS = ['VITD', 'VITB12', 'FOLAC', 'VITC', 'FE', 'ZN', 'MG', 'ID', 'CA', 'EPADHA'];
/** 1 µg synthetic folic acid = 1.7 µg dietary folate equivalents (BLS formula FOL = FOLFD + 1.7 × FOLAC). */
const DFE_PER_FOLIC_ACID = 1.7;
/** Labels give salt in g; BLS tracks sodium in mg (salt = sodium × 2.5). */
const SODIUM_MG_PER_SALT_G = 1000 / 2.5;

/** Manual entry: a free name plus whatever nutrients are known (label, supplement). */
export function ManualSheet({ supplement, time: initialTime, onClose, onAdded }: { supplement: boolean; day: string; time: number; onClose: () => void; onAdded: (e: LogEntry) => void }) {
  const [name, setName] = useState('');
  const [isSupplement, setIsSupplement] = useState(supplement);
  const [basis, setBasis] = useState<'total' | 'per100'>('total');
  const [grams, setGrams] = useState<number>();
  const [salt, setSalt] = useState<number>();
  const [values, setValues] = useState<Record<string, number | undefined>>({});
  const [showAll, setShowAll] = useState(false);
  const [confidence, setConfidence] = useState<EntryConfidence>(supplement ? 'A' : 'C');
  // The meal's time is set once, at the top of the Log screen (owner's ask, 2026-10-22).
  const time = initialTime;
  const [saveForLater, setSaveForLater] = useState(supplement);
  const [servingLabel, setServingLabel] = useState(supplement ? t('manual.oneTablet') : t('manual.oneServing'));

  const primary = isSupplement ? SUPPLEMENT_FIELDS : FOOD_FIELDS;
  const fields = showAll ? NUTRIENTS.map((n) => n.id).filter((id) => !primary.includes(id)) : [];
  const factor = basis === 'per100' ? (grams ?? 0) / 100 : 1;

  function nutrientsTotal(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, v] of Object.entries(values)) if (v !== undefined) out[id] = v * factor;
    if (salt !== undefined && values.NA === undefined) out.NA = salt * SODIUM_MG_PER_SALT_G * factor;
    // Folic acid (labels, supplements) counts towards folate equivalents and its own upper limit.
    if (out.FOLAC !== undefined) out.FOL = (out.FOL ?? 0) + out.FOLAC * DFE_PER_FOLIC_ACID;
    // Vitamin A in supplements is preformed (retinol), which the upper limit applies to.
    if (isSupplement && out.VITAA !== undefined && out.RETOL === undefined) out.RETOL = out.VITAA;
    return out;
  }
  const valid = name.trim().length > 0 && (basis === 'total' || (grams ?? 0) > 0) && Object.keys(nutrientsTotal()).length > 0;

  async function save() {
    if (!valid) return;
    const nutrients = nutrientsTotal();
    const day = dayKey(new Date(time));
    let entry: LogEntry;
    if (saveForLater) {
      const cf = await repo.saveCustomFood({
        name: name.trim(),
        isSupplement,
        servingLabel: servingLabel.trim() || t('manual.oneServing'),
        servingGrams: basis === 'per100' ? grams : undefined,
        nutrients,
        confidence,
      });
      entry = await repo.addLog({ kind: 'custom', customFoodId: cf.id, servings: 1, time, day, confidence, label: cf.name });
    } else {
      entry = await repo.addLog({ kind: 'manual', nutrients, isSupplement, time, day, confidence, label: name.trim() });
    }
    onAdded(entry);
  }

  const input = (id: string) => {
    const def = NUTRIENT_BY_ID.get(id) ?? { name: t('manual.folicAcid'), unit: 'µg' };
    return (
      <Field key={id} label={def.name}>
        {(fid) => <NumberInput id={fid} value={values[id]} onChange={(v) => setValues((s) => ({ ...s, [id]: v }))} suffix={def.unit} min={0} />}
      </Field>
    );
  };

  return (
    <Sheet title={isSupplement ? t('log.supplement') : t('log.manual')} onClose={onClose}>
      <Field label={t('manual.name')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder={isSupplement ? 'Vitamin D3 20 µg' : t('manual.namePlaceholder')} />}</Field>
      <Toggle checked={isSupplement} onChange={setIsSupplement} label={t('manual.isSupplement')} description={t('manual.isSupplementHint')} />
      {!isSupplement && (
        <div className="field">
          <span className="field-label">{t('manual.valuesFor')}</span>
          <Segmented
            label={t('manual.valuesFor')}
            value={basis}
            onChange={setBasis}
            options={[
              { value: 'total', label: t('manual.whatIAte') },
              { value: 'per100', label: t('manual.per100') },
            ]}
          />
        </div>
      )}
      {basis === 'per100' && !isSupplement && <Field label={t('manual.gramsEaten')}>{(id) => <NumberInput id={id} value={grams} onChange={setGrams} suffix="g" min={0} />}</Field>}
      <div className="grid-2">
        {primary.map(input)}
        {!isSupplement && (
          <Field label={t('manual.salt')}>{(id) => <NumberInput id={id} value={salt} onChange={setSalt} suffix="g" min={0} />}</Field>
        )}
        {fields.map(input)}
      </div>
      {!showAll && (
        <button className="btn btn-small btn-ghost" onClick={() => setShowAll(true)}>
          {t('manual.moreNutrients')}
        </button>
      )}
      <p className="muted small">{t('manual.unknownHint')}</p>
      <ConfidenceField value={confidence} onChange={setConfidence} />
      <Toggle checked={saveForLater} onChange={setSaveForLater} label={t('manual.saveForLater')} />
      {saveForLater && <Field label={t('manual.servingLabel')}>{(id) => <input id={id} value={servingLabel} onChange={(e) => setServingLabel(e.target.value)} />}</Field>}
      <p className="muted small">{t('log.atMealTime', { time: formatDateTime(time) })}</p>
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!valid} onClick={() => void save()}>
          {t('log.add')}
        </button>
      </div>
    </Sheet>
  );
}
