import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { newId } from '../../lib/id';
import { onShoppingList, planReports, type Report } from '../../logic/pantry';
import { amountText, planAdd } from '../../logic/shopping';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { CURRENT_SCHEMA_VERSION } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { placeName, usePantryFoods, usePantryLeft } from '../pantry/usePantry';
import { useRegister, type Card, type CardProps, type Undo } from './cards';
import { ChangeButton, DoneRow } from './CardFrame';

/**
 * Things for At home the assistant proposes (H1, …): what was bought (put away, adding to what is
 * there), and what runs low or is used up (marked so, and put on the shopping list), each tickable.
 */
export function HomeCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'home' }>>) {
  const { home } = card;
  const d = useData();
  const left = usePantryLeft();
  const { placeOf, asShopping } = usePantryFoods();
  const shoppingOn = isOn(d.settings.features, 'shoppingList');
  const reports = useMemo(
    (): Report[] =>
      home.items.map(({ product: _p, place, ...it }) => ({ ...it, place: place ?? placeOf(it.name, it.ref) })),
    // Places are guessed once per card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [home],
  );
  const [off, setOff] = useState<ReadonlySet<number>>(new Set());
  const chosen = reports.filter((_, i) => !off.has(i));
  const [saving, setSaving] = useState(false);

  async function save(): Promise<Undo | undefined> {
    if (!chosen.length || saving) return;
    setSaving(true);
    try {
      const now = Date.now();
      // Products looked up in the chat are kept, so the things can be logged later.
      for (const [i, it] of home.items.entries()) if (it.product && !off.has(i)) await repo.saveProduct(it.product);
      const undo = await repo.changeHome((pantry, shopping) => {
        const listed = shoppingOn ? chosen.filter((r) => r.status !== 'bought' && !onShoppingList(r, shopping)) : [];
        return {
          pantry: planReports(pantry, chosen, now, newId, CURRENT_SCHEMA_VERSION, left),
          ...(listed.length ? { shopping: planAdd(shopping, listed.map((r) => asShopping(r, shopping)), now, newId, CURRENT_SCHEMA_VERSION) } : {}),
        };
      });
      onLogged(true, { saved: chosen.map((r) => `${r.name} (${r.status})`) });
      return async () => {
        await repo.undoHome(undo);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(home.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('pantry.savedN', { n: chosen.length }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('pantry.savedN', { n: chosen.length })} <a href={href('kitchen')}>{t('pantry.openPage')}</a>
        </span>
      </DoneRow>
    );
  }

  const toggle = (i: number) => {
    const next = new Set(off);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setOff(next);
  };
  const statusText = (r: Report) => (r.status === 'low' ? t('pantry.cardLow') : r.status === 'out' ? t('pantry.cardOut') : t('pantry.cardBought'));

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="pantry" size={18} /> {t('pantry.cardTitle')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {home.id}
        </span>
      </div>
      <ul className="plain-list shop-pick">
        {reports.map((r, i) => (
          <li key={i}>
            <button className="shop-row" role="checkbox" aria-checked={!off.has(i)} onClick={() => toggle(i)}>
              <span className={`shop-check${off.has(i) ? '' : ' on'}`} aria-hidden>
                {!off.has(i) && <Icon name="check" size={16} />}
              </span>
              <span className="shop-text">
                <span className="shop-name">{r.name}</span>
                <span className="muted small">
                  {statusText(r)} · {placeName(r.place)}
                </span>
              </span>
              <span className="muted small shop-amount">{r.pieces !== undefined ? t('pantry.pieces', { n: r.pieces }) : amountText(r)}</span>
            </button>
          </li>
        ))}
      </ul>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!chosen.length || saving} onClick={() => void saveOne()}>
          {t('pantry.saveN', { n: chosen.length })}
        </button>
      </div>
    </div>
  );
}
