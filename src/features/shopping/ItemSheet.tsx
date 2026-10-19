import { useState } from 'react';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { amountText, parseAmount } from '../../logic/shopping';
import { repo } from '../../storage/repo';
import { SHOP_SECTIONS, type ShopSection, type ShoppingItem } from '../../storage/types';
import { Field, Sheet } from '../../ui/controls';

export const sectionName = (s: ShopSection) => t(`shopping.section.${s}` as MessageKey);

/** Change a line: its name, amount and shop section, or take it off the list. */
export function ItemSheet({ item, onClose }: { item: ShoppingItem; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(item.name);
  const [amount, setAmount] = useState(amountText(item));
  const [section, setSection] = useState<ShopSection>(item.section);

  async function save() {
    if (!name.trim()) return;
    const next: ShoppingItem = { ...item, name: name.trim(), section };
    delete next.grams;
    delete next.amount;
    // Amounts made of several parts ("500 g + 1 pack") stay as typed.
    Object.assign(next, parseAmount(amount));
    await repo.changeShopping(() => ({ put: [next], remove: [] }));
    onClose();
  }

  async function remove() {
    const undo = await repo.changeShopping(() => ({ put: [], remove: [item.id] }));
    toast(t('shopping.removed', { name: item.name }), () => repo.undoShopping(undo));
    onClose();
  }

  return (
    <Sheet title={t('shopping.editTitle')} onClose={onClose}>
      <Field label={t('shopping.name')}>{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} />}</Field>
      <Field label={t('shopping.amount')} hint={t('shopping.amountHint')}>
        {(id) => <input id={id} value={amount} placeholder={t('shopping.amountPlaceholder')} onChange={(e) => setAmount(e.target.value)} />}
      </Field>
      <Field label={t('shopping.section')}>
        {(id) => (
          <select id={id} value={section} onChange={(e) => setSection(e.target.value as ShopSection)}>
            {SHOP_SECTIONS.map((s) => (
              <option key={s} value={s}>
                {sectionName(s)}
              </option>
            ))}
          </select>
        )}
      </Field>
      {item.recipes?.length ? <p className="muted small">{t('shopping.forRecipes', { names: item.recipes.join(', ') })}</p> : null}
      <div className="sheet-actions">
        <button className="btn btn-danger-ghost" onClick={() => void remove()}>
          {t('shopping.remove')}
        </button>
        <button className="btn btn-primary" disabled={!name.trim()} onClick={() => void save()}>
          {t('common.save')}
        </button>
      </div>
    </Sheet>
  );
}
