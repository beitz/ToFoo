import { useState } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { labelValues, mixedFood } from '../../foods/products';
import { formatDay } from '../../lib/dates';
import { repo } from '../../storage/repo';
import type { LogEntry, Product } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { makeUp } from '../food/makeUp';
import { pairingName } from '../food/pairingName';
import { ChangeButton, DoneRow } from './CardFrame';
import { useRegister, type Card, type CardProps, type Undo } from './cards';

/**
 * A fix from the assistant's check of the logged foods (F1, …): a product's new similar BLS food
 * (or its ingredients, or label values only), shown beside its label; or another BLS food for
 * entries logged as a BLS food. Applying it is one tap with undo.
 */
export function FoodFixCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'fix' }>>) {
  const { fix } = card;
  const d = useData();
  const [saving, setSaving] = useState(false);
  const product = d.productsById.get(fix.food);
  const newMatch = fix.use === 'label_only' || !fix.code ? undefined : { version: d.foods.version, code: fix.code, ...(fix.parts ? { parts: fix.parts } : {}) };
  const newName = newMatch ? pairingName(newMatch, d.foods) : t('fix.labelOnly');
  const newFood = newMatch ? (newMatch.parts ? mixedFood(newMatch.parts, d.foods) : d.foods.byCode.get(newMatch.code)) : undefined;
  const entries = (fix.entryIds ?? []).map((id) => d.log.find((e) => e.id === id)).filter((e): e is Extract<LogEntry, { kind: 'food' }> => e?.kind === 'food');
  const now = product ? (product.match ? pairingName(product.match, d.foods) : product.labelOnly ? t('fix.labelOnly') : t('fix.noFood')) : (d.foods.byCode.get(fix.food.slice(4))?.nameEn ?? fix.name);
  const valid = product ? true : entries.length > 0 && !!newMatch;

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    try {
      if (product) {
        const old: Pick<Product, 'match' | 'labelOnly'> = { ...(product.match ? { match: product.match } : {}), ...(product.labelOnly ? { labelOnly: true as const } : {}) };
        await repo.setProductMatch(product.id, newMatch ? { match: newMatch } : { labelOnly: true });
        onLogged(true, { food: fix.food, now: newName });
        return async () => {
          await repo.setProductMatch(product.id, old);
          onLogged(false);
        };
      }
      const food = d.foods.byCode.get(fix.code!)!;
      for (const e of entries) await repo.updateLog({ ...e, ref: { source: 'BLS', version: d.foods.version, code: food.code }, label: food.nameEn });
      onLogged(true, { food: fix.food, now: newName, entries: entries.length });
      return async () => {
        for (const e of entries) await repo.updateLog(e);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(fix.id, card.logged ? undefined : save, register);

  async function applyOne() {
    const undo = await save();
    if (undo) toast(t('fix.applied', { name: fix.name, food: newName }), undo);
  }

  if (card.logged) {
    return (
      <DoneRow>
        <span>
          {t('fix.done', { name: fix.name, food: newName })} <a href={href('settings', 'check')}>{t('fix.openCheck')}</a>
        </span>
      </DoneRow>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="warning" size={18} /> {fix.name}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {fix.id}
        </span>
      </div>
      {fix.reason && <p>{fix.reason}</p>}
      <p className="small">
        {t('fix.now')}: {now}
        <br />
        <strong>
          {t('fix.new')}: {newName}
        </strong>
      </p>
      {product && (
        <p className="muted small check-compare">
          {t('check.label')}: {makeUp(labelValues(product))}
          {newFood && (
            <>
              <br />
              {newName}: {makeUp(newFood.per100)}
            </>
          )}
        </p>
      )}
      <p className="muted small">
        {product
          ? t('fix.everyEntry')
          : entries.length
            ? t('fix.entries', { n: entries.length, list: entries.map((e) => `${formatDay(e.day, d.today)} ${Math.round(e.grams)} g`).join(', ') })
            : t('fix.entriesGone')}
      </p>
      <div className="sheet-actions">
        <ChangeButton />
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void applyOne()}>
          {t('fix.apply')}
        </button>
      </div>
    </div>
  );
}
