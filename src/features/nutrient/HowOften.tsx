import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount } from '../../lib/format';
import { coverExamples, slowBasis } from '../../logic/howOften';
import { howOften } from '../../../model/howOften';
import { slowWindow, vitaminKTurnover } from '../../../model/parameters';
import { Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';

/**
 * "How often" chip in the nutrient page's hero (owner's ask, 2026-10-26): the DGE food rule in a few words;
 * a tap shows what 100 g of a few example foods covers and, for nutrients the body evens out slowly, why a
 * meal every week or two is enough. Nothing shows for nutrients the guidelines give no frequency for.
 */
export function HowOftenChip({ id, recommended }: { id: string; recommended: number }) {
  const [open, setOpen] = useState(false);
  const rule = howOften[id];
  if (!rule) return null;
  const text = t(`often.${id}` as MessageKey);
  return (
    <>
      <button type="button" className="chip chip-link" data-tour="nutrient.often" aria-label={t('often.spoken', { rule: text })} onClick={() => setOpen(true)}>
        <Icon name="calendar" size={14} /> {text}
        <Icon name="chevron" size={12} />
      </button>
      {open &&
        createPortal(
          <Sheet title={t('often.title')} onClose={() => setOpen(false)}>
            <HowOftenNotes id={id} recommended={recommended} />
          </Sheet>,
          document.body,
        )}
    </>
  );
}

function HowOftenNotes({ id, recommended }: { id: string; recommended: number }) {
  const d = useData();
  const rule = howOften[id]!;
  const examples = coverExamples(id, d.foods.byCode, recommended);
  const basis = slowBasis(id);
  return (
    <div className="info-sheet often-sheet">
      <p>
        <strong>{t(`often.${id}` as MessageKey)}</strong>
      </p>
      <p className="muted small">
        <a href={rule.url} target="_blank" rel="noreferrer">
          {t('often.source')}
        </a>
      </p>
      {examples.length > 0 && (
        <>
          <p>{t('often.examples', { ref: fmtAmount(id, recommended) })}</p>
          <ul className="plain-list often-list">
            {examples.map((e) => (
              <li key={e.food.code}>
                <a className="often-line" href={href('food', e.food.code)} aria-label={t('often.exampleSpoken', { food: e.food.nameEn, n: Math.round(e.days) })}>
                  <span className="grow">{e.food.nameEn}</span>
                  <strong>{t('often.example', { n: Math.round(e.days) })}</strong>
                  <Icon name="chevron" size={12} />
                </a>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('often.examplesSource')}</p>
        </>
      )}
      {basis && <WindowWhy id={id} />}
      <p className="muted small">{t('often.dgeOnly')}</p>
    </div>
  );
}

/** Why a nutrient's average spans the days it does, with its source; nothing for the usual windows. */
export function WindowWhy({ id }: { id: string }) {
  const d = useData();
  const basis = slowBasis(id);
  const key = `window.${id}` as MessageKey;
  if (basis) {
    return (
      <p>
        {t('window.slow', { weeks: Math.round(slowWindow.value / 7), usual: d.settings.longWindowDays })} {t(key)}{' '}
        <a href={basis.url} target="_blank" rel="noreferrer">
          {t('window.sourceLink')}
        </a>
      </p>
    );
  }
  return id === 'VITK' ? (
    <p>
      {t(key, { days: d.settings.shortWindowDays })}{' '}
      <a href={vitaminKTurnover.url} target="_blank" rel="noreferrer">
        {t('window.sourceLink')}
      </a>
    </p>
  ) : null;
}
