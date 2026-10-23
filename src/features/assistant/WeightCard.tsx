import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { MAX_WEIGHT_KG, MIN_WEIGHT_KG } from '../../logic/weight';
import { DateInput } from '../../ui/DateInputs';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { fmtKg } from '../weight/format';
import { saveWeighIn } from '../weight/weighIns';
import { ChangeButton, DoneRow } from './CardFrame';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/** A weigh-in the user told the assistant (G1, …): check the weight and day, then save. */
export function WeightProposalCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'weight' }>>) {
  const { weight } = card;
  const d = useData();
  const [kg, setKg] = useState<number | undefined>(weight.kg);
  const [day, setDay] = useState(weight.day ?? d.today);
  const [saving, setSaving] = useState(false);
  const valid = kg !== undefined && kg >= MIN_WEIGHT_KG && kg <= MAX_WEIGHT_KG && day <= d.today;
  const replacing = d.profile.weightHistory.find((w) => w.day === day);

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const undo = await saveWeighIn(day, kg);
      onLogged(true, { kg, day });
      return async () => {
        await undo();
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(weight.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo && kg !== undefined) toast(t('weight.saved', { kg: fmtKg(kg) }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('ai.weightSaved', { kg: fmtKg(kg ?? 0), day: formatDay(day, d.today) })} <a href={href('weight')}>{t('ai.weightOpen')}</a>
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="scale" size={18} /> {t('weight.title')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {weight.id}
        </span>
      </div>
      <Field label={t('weight.weight')}>{(id) => <NumberInput id={id} value={kg} onChange={setKg} suffix="kg" min={MIN_WEIGHT_KG} />}</Field>
      <Field label={t('weight.day')}>{(id) => <DateInput id={id} value={day} max={d.today} onChange={(e) => e.target.value && setDay(e.target.value)} />}</Field>
      {replacing && <p className="muted small">{t('weight.replaces', { kg: fmtKg(replacing.kg) })}</p>}
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void saveOne()}>
          {t('weight.save')}
        </button>
      </div>
    </div>
  );
}
