import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatDay } from '../../lib/dates';
import type { Storage } from '../../model/paramTypes';
import { repo } from '../../storage/repo';
import type { Batch } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { Segmented, Sheet } from '../../ui/controls';
import { logPortion, nextStorage, totalLeft } from '../home/StockChips';
import { fmtGrams } from '../../lib/format';
import { BatchSheet } from './BatchSheet';

export function RecipesPage() {
  const d = useData();
  const toast = useToast();
  const [removing, setRemoving] = useState<Batch | null>(null);
  const [potOf, setPotOf] = useState<Batch | null>(null);
  const inStock = d.batches.filter((b) => totalLeft(b) > 0).sort((a, b) => a.cookedAt - b.cookedAt);
  const recipes = [...d.recipes].filter((r) => !r.archived).sort((a, b) => a.name.localeCompare(b.name));
  const lastCooked = (id: string) => d.batches.filter((b) => b.recipeId === id).reduce<string | null>((m, b) => (m === null || b.cookedDay > m ? b.cookedDay : m), null);

  return (
    <section>
      <header className="page-head row-between">
        <h1>{t('recipes.title')}</h1>
        <a className="btn btn-primary btn-small" href={href('recipes', 'new')}>
          <Icon name="plus" /> {t('recipes.new')}
        </a>
      </header>

      <h2 className="section-title">{t('stock.title')}</h2>
      {inStock.length === 0 && <p className="muted">{t('stock.empty')}</p>}
      {inStock.map((b) => {
        const s = nextStorage(b, d.today);
        return (
          <div className="card stock-card" key={b.id}>
            <div className="row-between">
              <a href={href('recipes', b.recipeId)}>
                <strong>{b.recipe.name}</strong>
              </a>
              <span className="muted small">{t('stock.cooked', { day: formatDay(b.cookedDay, d.today) })}</span>
            </div>
            {b.cookedGrams ? <p className="muted small">{t('batch.weighedLine', { grams: fmtGrams(b.cookedGrams), per: fmtGrams(b.cookedGrams / b.recipe.portions) })}</p> : null}
            <div className="stock-counts">
              <span>
                <Icon name="pot" size={16} /> {t('storage.fresh')} {b.remaining.fresh}
              </span>
              <span>
                <Icon name="fridge" size={16} /> {t('storage.fridge')} {b.remaining.fridge}
              </span>
              <span>
                <Icon name="snow" size={16} /> {t('storage.freezer')} {b.remaining.freezer}
              </span>
            </div>
            <div className="row wrap">
              <button className="btn btn-small btn-primary" disabled={!s} onClick={() => s && void logPortion(b, s, toast)}>
                {t('stock.eatOne')}
              </button>
              {b.remaining.fridge + b.remaining.fresh > 0 && (
                <button className="btn btn-small" onClick={() => void repo.moveBatchPortion(b.id, b.remaining.fridge > 0 ? 'fridge' : 'fresh', 'freezer')}>
                  {t('stock.toFreezer')}
                </button>
              )}
              <button className="btn btn-small btn-ghost" onClick={() => setRemoving(b)}>
                {t('stock.removeOne')}
              </button>
              <button className="btn btn-small btn-ghost" onClick={() => setPotOf(b)}>
                <Icon name="pot" size={16} /> {t(b.cookedGrams ? 'batch.thisPot' : 'batch.weighPot')}
              </button>
            </div>
          </div>
        );
      })}

      <h2 className="section-title">{t('recipes.book')}</h2>
      {recipes.length === 0 && <p className="muted">{t('recipes.empty')}</p>}
      <ul className="result-list">
        {recipes.map((r) => {
          const lc = lastCooked(r.id);
          return (
            <li key={r.id}>
              <a className="result" href={href('recipes', r.id)}>
                <span className="result-name">{r.name}</span>
                <span className="muted small">
                  {t('recipes.portions', { n: r.portions })} · {t('recipes.ingredients', { n: r.ingredients.length })}
                  {lc ? ` · ${t('recipes.lastCooked', { day: formatDay(lc, d.today) })}` : ''}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      {removing && <RemoveSheet batch={removing} onClose={() => setRemoving(null)} />}
      {potOf && <BatchSheet batch={d.batchesById.get(potOf.id) ?? potOf} onClose={() => setPotOf(null)} />}
    </section>
  );
}

function RemoveSheet({ batch, onClose }: { batch: Batch; onClose: () => void }) {
  const toast = useToast();
  const options = (['fresh', 'fridge', 'freezer'] as Storage[]).filter((s) => batch.remaining[s] > 0);
  const [storage, setStorage] = useState<Storage>(options[options.length - 1] ?? 'freezer');
  const [reason, setReason] = useState<'discarded' | 'givenAway' | 'correction'>('givenAway');
  async function save() {
    await repo.correctBatch(batch.id, storage, -1, reason);
    toast(t('stock.removed'), () => void repo.correctBatch(batch.id, storage, 1, 'correction'));
    onClose();
  }
  return (
    <Sheet title={t('stock.removeOne')} onClose={onClose}>
      <p>{batch.recipe.name}</p>
      <div className="field">
        <span className="field-label">{t('diary.storage')}</span>
        <Segmented<Storage> label={t('diary.storage')} value={storage} onChange={setStorage} options={options.map((s) => ({ value: s, label: t(`storage.${s}`) }))} />
      </div>
      <div className="field">
        <span className="field-label">{t('stock.reason')}</span>
        <Segmented
          label={t('stock.reason')}
          value={reason}
          onChange={setReason}
          options={[
            { value: 'givenAway', label: t('stock.givenAway') },
            { value: 'discarded', label: t('stock.discarded') },
            { value: 'correction', label: t('stock.correction') },
          ]}
        />
      </div>
      <div className="sheet-actions">
        <button className="btn btn-primary" onClick={() => void save()}>
          {t('stock.removeOne')}
        </button>
      </div>
    </Sheet>
  );
}
