import { useMemo, useState } from 'react';
import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { search } from '../../foods/search';
import { ALL_SALT_CODES, saltCode } from '../../foods/foodDb';
import { repo } from '../../storage/repo';
import type { Ingredient, Recipe, StoragePlan } from '../../storage/types';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { PreparationSelect } from '../log/PreparationSelect';
import { PortionNutrients } from './PortionNutrients';
import { PlanEditor } from './PlanEditor';

/** Create or edit a recipe. Route: #/recipes/new or #/recipes/<id>/edit. */
export function RecipeEditor({ id }: { id?: string }) {
  const d = useData();
  const existing = id ? d.recipes.find((r) => r.id === id) : undefined;
  const [name, setName] = useState(existing?.name ?? '');
  const [portions, setPortions] = useState<number | undefined>(existing?.portions ?? 4);
  const [ingredients, setIngredients] = useState<Ingredient[]>(existing?.ingredients ?? []);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [tags, setTags] = useState((existing?.tags ?? []).join(', '));
  const [plan, setPlan] = useState<StoragePlan | undefined>(existing?.defaultPlan);
  const [saltOverride, setSaltOverride] = useState(existing?.saltOverride);
  const hasSalt = ingredients.some((i) => i.isSalt);
  const [query, setQuery] = useState('');

  const results = useMemo(() => (query.trim() ? search(d.searchIndex, query, { limit: 12, recent: d.recentFoods, boost: d.searchBoost }) : []), [query, d.searchIndex, d.recentFoods, d.searchBoost]);

  function addIngredient(code: string) {
    const food = d.foods.byCode.get(code);
    if (!food) return;
    const isSalt = ALL_SALT_CODES.has(code);
    setIngredients((list) => [...list, { ref: { source: 'BLS', version: d.foods.version, code: isSalt ? saltCode(d.profile.salt) : code }, name: food.nameEn, grams: 0, preparation: 'asListed', ...(isSalt ? { isSalt: true } : {}) }]);
    setQuery('');
  }
  const update = (i: number, patch: Partial<Ingredient>) => setIngredients((list) => list.map((ing, j) => (j === i ? { ...ing, ...patch } : ing)));
  const remove = (i: number) => setIngredients((list) => list.filter((_, j) => j !== i));
  const move = (i: number, dir: -1 | 1) =>
    setIngredients((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const copy = [...list];
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
      return copy;
    });

  const valid = name.trim() && portions && portions >= 1 && ingredients.length > 0 && ingredients.every((i) => i.grams > 0);
  const draft: Recipe | null = valid
    ? {
        id: existing?.id ?? 'draft',
        schemaVersion: 1,
        name: name.trim(),
        portions: Math.round(portions!),
        ingredients,
        tags: [],
        saltOverride,
        createdAt: 0,
        updatedAt: 0,
      }
    : null;

  async function save() {
    if (!valid) return;
    const rec = await repo.saveRecipe({
      id: existing?.id,
      createdAt: existing?.createdAt,
      name: name.trim(),
      portions: Math.round(portions!),
      ingredients,
      notes: notes.trim() || undefined,
      tags: tags
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      defaultPlan: plan,
      saltOverride: hasSalt ? saltOverride : undefined,
    });
    navigate('recipes', rec.id);
  }

  return (
    <section>
      <header className="page-head row">
        <a className="icon-btn" href={existing ? href('recipes', existing.id) : href('recipes')} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{existing ? t('recipes.edit') : t('recipes.new')}</h1>
      </header>

      <Field label={t('recipes.name')}>{(fid) => <input id={fid} value={name} onChange={(e) => setName(e.target.value)} placeholder="Linsencurry" />}</Field>
      <Field label={t('recipes.portionsLabel')}>{(fid) => <NumberInput id={fid} value={portions} onChange={setPortions} min={1} />}</Field>

      <h2 className="section-title">{t('recipes.ingredientsTitle')}</h2>
      <p className="muted small">{t('recipes.ingredientsHint')}</p>
      <ul className="plain-list ingredient-list">
        {ingredients.map((ing, i) => {
          const food = ing.ref.source === 'BLS' ? d.foods.byCode.get(ing.ref.code) : undefined;
          return (
            <li key={`${ing.ref.source === 'custom' ? ing.ref.id : ing.ref.code}-${i}`} className="card ingredient">
              <div className="row-between">
                <div>
                  <strong>{ing.isSalt ? t('recipes.salt') : (food?.nameEn ?? ing.name)}</strong>
                  <div className="muted small">{ing.isSalt ? t('recipes.saltHint') : (food?.nameDe ?? t('recipes.missingFood'))}</div>
                </div>
                <div className="row">
                  <button className="icon-btn" onClick={() => move(i, -1)} aria-label={t('recipes.moveUp')} disabled={i === 0}>
                    ↑
                  </button>
                  <button className="icon-btn" onClick={() => remove(i)} aria-label={t('common.delete')}>
                    <Icon name="trash" size={18} />
                  </button>
                </div>
              </div>
              <div className="grid-2">
                <Field label={t('log.amount')}>{(fid) => <NumberInput id={fid} value={ing.grams || undefined} onChange={(v) => update(i, { grams: v ?? 0 })} suffix="g" min={0} autoFocus={ing.grams === 0} />}</Field>
                <PreparationSelect id={`prep-${i}`} hint={false} value={ing.preparation} onChange={(p) => update(i, { preparation: p })} />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="search-box">
        <Icon name="search" />
        <input type="search" placeholder={t('recipes.addIngredient')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('recipes.addIngredient')} />
      </div>
      {results.length > 0 && (
        <ul className="result-list">
          {results.map((r) => (
            <li key={r.key}>
              <button className="result" onClick={() => addIngredient(r.key)}>
                <span className="result-name">{r.nameEn}</span>
                <span className="muted small">{r.nameDe}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {hasSalt && (
        <div className="field">
          <label htmlFor="salt-choice">{t('recipes.saltChoice')}</label>
          <select
            id="salt-choice"
            value={saltOverride ? `${saltOverride.iodised ? 'i' : ''}${saltOverride.fluoridated ? 'f' : ''}` || 'plain' : 'default'}
            onChange={(e) => {
              const v = e.target.value;
              setSaltOverride(v === 'default' ? undefined : { iodised: v.includes('i'), fluoridated: v.includes('f') });
            }}
          >
            <option value="default">{t('recipes.saltDefault')}</option>
            <option value="i">{t('recipes.saltIodised')}</option>
            <option value="if">{t('recipes.saltIodisedFluoride')}</option>
            <option value="plain">{t('recipes.saltPlain')}</option>
          </select>
        </div>
      )}

      <h2 className="section-title">{t('recipes.storagePlan')}</h2>
      <PlanEditor plan={plan ?? d.settings.defaultPlan} portions={portions ?? 1} onChange={setPlan} />

      <Field label={t('recipes.notes')}>{(fid) => <textarea id={fid} rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />}</Field>
      <Field label={t('recipes.tags')} hint={t('recipes.tagsHint')}>
        {(fid) => <input id={fid} value={tags} onChange={(e) => setTags(e.target.value)} />}
      </Field>

      {draft && (
        <>
          <h2 className="section-title">{t('recipes.perPortion')}</h2>
          <PortionNutrients recipe={draft} />
        </>
      )}

      <div className="sticky-actions">
        <button className="btn btn-primary btn-block" disabled={!valid} onClick={() => void save()}>
          {t('common.save')}
        </button>
        {!valid && <p className="muted small">{t('recipes.incomplete')}</p>}
      </div>
    </section>
  );
}
