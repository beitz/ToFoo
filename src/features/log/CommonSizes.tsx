import { useMemo, useState } from 'react';
import { commonSizes, sizeLabel, usdaFoodUrl, type CommonSizes } from '../../foods/portions';
import { t, type MessageKey } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { Icon } from '../../ui/Icon';

const round1 = (g: number) => Math.round(g * 10) / 10;

/**
 * One-tap common sizes of a BLS food ("1 medium · 182 g"), from USDA (src/foods/portions.ts). A tap
 * sets the grams; tapping the same size again adds one more (2 × medium). Below, where the weights
 * come from, folded. Renders nothing for foods without sizes.
 */
export function CommonSizeChips({ code, grams, onPick }: { code: string; grams: number | undefined; onPick: (grams: number) => void }) {
  const sizes = useMemo(() => commonSizes(code), [code]);
  const [picked, setPicked] = useState<{ label: string; n: number }>();
  if (!sizes) return null;
  const size = picked ? sizes.sizes.find((s) => s.label === picked.label) : undefined;
  // Typing another amount ends the pick.
  const active = picked && size && grams !== undefined && Math.abs(grams - round1(size.grams * picked.n)) < 0.05 ? picked : undefined;
  return (
    <div className="common-sizes">
      <div className="chips" role="group" aria-label={t('portions.label')}>
        {sizes.sizes.map((s) => {
          const n = active?.label === s.label ? active.n : 0;
          return (
            <button
              key={s.label}
              type="button"
              className={`chip${n ? ' on' : ''}`}
              aria-pressed={!!n}
              onClick={() => {
                const next = n + 1;
                setPicked({ label: s.label, n: next });
                onPick(round1(s.grams * next));
              }}
            >
              {sizeLabel(s.label, n || 1)} · {fmtNumber(round1(s.grams * (n || 1)), 1)} g
            </button>
          );
        })}
      </div>
      <SizesSource sizes={sizes} again={!!active} />
    </div>
  );
}

/** Where the sizes come from: one folded line, open for each size's meaning and the USDA page. */
function SizesSource({ sizes, again }: { sizes: CommonSizes; again: boolean }) {
  return (
    <details className="fold sizes-source">
      <summary className="muted small">
        <Icon name="info" size={16} />
        <span>
          {t('portions.from', { name: sizes.usdaName })}
          {again ? ` · ${t('portions.again')}` : ''}
        </span>
      </summary>
      <ul className="sizes-list small">
        {sizes.sizes.map((s) => (
          <li key={s.label}>
            <span>{s.label}</span>
            {s.detail ? <span className="muted"> · {s.detail}</span> : null}
            <span className="num"> · {fmtNumber(s.grams, 1)} g</span>
          </li>
        ))}
      </ul>
      {sizes.note && <p className="small">{t(`portions.note.${sizes.note}` as MessageKey)}</p>}
      <p className="muted small">
        {t('portions.how')}{' '}
        <a href={usdaFoodUrl(sizes.fdcId)} target="_blank" rel="noreferrer">
          {t('portions.usdaPage')}
        </a>
      </p>
    </details>
  );
}
