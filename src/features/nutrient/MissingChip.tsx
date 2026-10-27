import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { missingFoods } from '../../logic/nutrientPage';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';

/**
 * "2 foods without a value" in the nutrient page's hero (owner's question, 2026-10-27: "1 days with gaps"
 * on a single day made no sense, and "gaps" means shortfalls elsewhere). Names the count of foods, not
 * days, and a tap lists them, each opening its entry, so the user can see or change where it came from.
 */
export function MissingChip({ id, days }: { id: string; days: readonly string[] }) {
  const d = useData();
  const [open, setOpen] = useState(false);
  const foods = useMemo(() => missingFoods(days, d.modelEntries, id), [days, d.modelEntries, id]);
  if (foods.length === 0) return null;
  const name = NUTRIENT_BY_ID.get(id)?.name ?? id;
  return (
    <>
      <button type="button" className="chip chip-warn chip-link" onClick={() => setOpen(true)}>
        <Icon name="question" size={14} /> {foods.length === 1 ? t('missing.chipOne') : t('missing.chip', { n: foods.length })}
        <Icon name="chevron" size={12} />
      </button>
      {open &&
        createPortal(
          <Sheet title={t('missing.title')} onClose={() => setOpen(false)}>
            <div className="info-sheet">
              <p>{t('missing.lead', { name })}</p>
              <ul className="plain-list often-list">
                {foods.map((f) => (
                  <li key={f.label}>
                    <a className="often-line" href={href('entry', f.entryId)}>
                      <span className="grow">
                        {f.label}
                        {f.parts.length > 0 && <span className="muted small"> · {f.parts.join(', ')}</span>}
                      </span>
                      {f.times > 1 && <span className="muted small">×{f.times}</span>}
                      <Icon name="chevron" size={12} />
                    </a>
                  </li>
                ))}
              </ul>
              <p className="muted small">{t('missing.hint')}</p>
            </div>
          </Sheet>,
          document.body,
        )}
    </>
  );
}
