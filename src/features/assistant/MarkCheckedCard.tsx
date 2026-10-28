import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { checkSignature, marksOf } from '../../logic/foodCheck';
import { repo } from '../../storage/repo';
import { Icon } from '../../ui/Icon';
import { ChangeButton, DoneRow } from './CardFrame';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/**
 * The foods the assistant's check found right (an F card), marked as checked in one tap with undo,
 * so the next check covers only new ones (owner's ask, 2026-10-27: "I don't want to check the same
 * things twice"). Each mark holds for the BLS food the food has now, like "Looks right" in Settings.
 */
export function MarkCheckedCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'checked' }>>) {
  const { checked } = card;
  const d = useData();
  const [saving, setSaving] = useState(false);
  const n = checked.foods.length;

  async function save(): Promise<Undo | undefined> {
    if (saving) return;
    setSaving(true);
    try {
      const marks: Record<string, string> = {};
      for (const { key } of checked.foods) {
        if (key.startsWith('BLS:')) marks[key] = 'BLS';
        else {
          const product = d.productsById.get(key);
          if (product) marks[key] = checkSignature({ source: product.source, code: product.code }, product);
        }
      }
      const before = marksOf(d.settings, Object.keys(marks));
      await repo.setFoodsChecked(marks);
      onLogged(true, { marked: Object.keys(marks).length });
      return async () => {
        await repo.setFoodMarks(before);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(checked.id, card.logged ? undefined : save, register);

  async function applyOne() {
    const undo = await save();
    if (undo) toast(t(n === 1 ? 'markChecked.doneOne' : 'markChecked.done', { n }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t(n === 1 ? 'markChecked.doneOne' : 'markChecked.done', { n })} <a href={href('settings', 'check')}>{t('fix.openCheck')}</a>
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="check" size={18} /> {t(n === 1 ? 'markChecked.headOne' : 'markChecked.head', { n })}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {checked.id}
        </span>
      </div>
      {checked.reason && <p>{checked.reason}</p>}
      <ul className="small mark-checked-list">
        {checked.foods.map((f) => (
          <li key={f.key}>{f.name}</li>
        ))}
      </ul>
      <p className="muted small">{t('markChecked.note')}</p>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={saving} onClick={() => void applyOne()}>
          {t('markChecked.apply')}
        </button>
      </div>
    </div>
  );
}
