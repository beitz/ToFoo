import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { EFFECT_SOURCES, hasEffectText } from '../../i18n/effects.en';
import { infoId, NUTRIENT_INFO_SOURCES, type InfoSource } from '../../i18n/nutrientInfo.en';
import { fmtFill, fmtPercent } from '../../lib/format';
import { findingOf, type Finding } from '../../logic/effects';
import { referenceValues } from '../../../model/reference-values';
import type { NutrientResult } from '../../model/simulate';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { statusLabel } from '../../ui/status';
import { StatusMark } from '../../ui/Tile';
import { contributorHref } from './CameFromCard';

/** Biggest sources named under "Most of yours came from" when a level is too high. */
const TOP_SOURCES = 3;

/**
 * "What your levels mean" at the top of a nutrient page (owner's ask, 2026-10-23): when the level is
 * low or too much, one line with what that can do; a tap opens why it shows, what helps, where yours
 * came from (too much) or what fills it (too little), and the sources. Nothing when the level is fine,
 * there is no data, or a store is filling (the hero already says so).
 */
export function EffectCard({ r }: { r: NutrientResult }) {
  const d = useData();
  if (!isOn(d.settings.features, 'levelEffects')) return null;
  const req = d.requirements.byNutrient.get(r.id);
  const f = findingOf(r, req, hasEffectText);
  if (!f || f.filling) return null;
  const key = infoId(r.id);
  const text = (part: string) => t(`effect.${key}.${part}` as MessageKey);
  const has = (part: string) => !text(part).startsWith('effect.');
  const headline = f.effect ? text(f.direction) : f.basis === 'ownTarget' ? t('levels.ownTarget') : f.basis === 'ownMax' ? t('levels.ownMax') : t('levels.noKnown');
  const help = f.effect && has(`${f.direction}Help`) ? text(`${f.direction}Help`) : undefined;
  const more = f.effect && has(`${f.direction}More`) ? text(`${f.direction}More`) : undefined;
  // No effect worth a line of its own: what is known about this direction, from the general texts.
  const known = !f.effect && f.basis !== 'ownTarget' && f.basis !== 'ownMax' ? t(`info.${key}.${f.direction}` as MessageKey) : undefined;
  const top = f.direction === 'high' ? r.contributors.slice(0, TOP_SOURCES).filter((c) => c.share > 0) : [];
  const sources = sourcesFor(r.id, f);

  return (
    <details className={`card fold level-card level-${f.status}`}>
      <summary>
        <StatusMark status={f.status} size={16} />
        <span className="grow level-line">
          <strong>{statusLabel(f.status)}</strong> · {headline}
        </span>
        <Icon name="down" size={16} />
      </summary>
      <div className="small fold-body level-body">
        <p>{whyText(r, f)}</p>
        {more && <p>{more}</p>}
        {known && (
          <p>
            <strong>{t('levels.known')}:</strong> {known}
          </p>
        )}
        {help && (
          <>
            <h3 className="level-sub">{t('levels.helps')}</h3>
            <p>{help}</p>
          </>
        )}
        {top.length > 0 && (
          <p>
            {t('levels.cameFrom')}:{' '}
            {top.map((c, i) => {
              const to = contributorHref(d, c.label);
              const label = `${c.label} ${fmtPercent(c.share)}`;
              return (
                <span key={c.label}>
                  {i > 0 && ', '}
                  {to ? <a href={to}>{label}</a> : label}
                </span>
              );
            })}
          </p>
        )}
        {f.effect && f.direction === 'low' && req && !req.limitOnly && (
          <a className="level-link" href={href('nutrient', r.id, 'foods')}>
            {t('levels.fillsBest')} <Icon name="chevron" size={14} />
          </a>
        )}
        {sources.length > 0 && (
          <div className="muted level-sources">
            <p>{t('levels.sources')}:</p>
            <ul>
              {sources.map((s) => (
                <li key={s.url}>
                  <a href={s.url} target="_blank" rel="noreferrer">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  );
}

/** Why the line shows, in the user's own numbers and the same words as the hero above. */
function whyText(r: NutrientResult, f: Finding): string {
  const days = r.windowDays;
  switch (f.basis) {
    case 'store':
      return t('levels.store', { pct: fmtFill(r.store?.fill.central ?? 0) });
    case 'limit':
      return t('levels.limit', { days, pct: fmtPercent(r.value.central) });
    case 'upperLimit':
      return t('levels.upperLimit', { days, pct: fmtPercent(r.ulRatio ?? 0) });
    case 'safeLevel':
      return t('levels.safeLevel', { days, pct: fmtPercent(r.ulRatio ?? 0) });
    case 'ownTarget':
      return t('levels.ownTargetWhy', { days, pct: fmtPercent(r.value.central) });
    case 'ownMax':
      return t('levels.ownMaxWhy', { days, pct: fmtPercent(r.value.central) });
    case 'need':
      return `${t('levels.need', { days, pct: fmtPercent(r.value.central) })} ${t(f.status === 'low' ? 'levels.needLow' : 'levels.needBitLow')}`;
  }
}

/** The nutrient's own source, any for this direction, and above an upper limit the limit's source; each once. */
export function sourcesFor(id: string, f: Finding): InfoSource[] {
  const key = infoId(id);
  const list: InfoSource[] = [];
  const own = NUTRIENT_INFO_SOURCES[key];
  if (own) list.push(own);
  list.push(...(EFFECT_SOURCES[`${key}.${f.direction}`] ?? []));
  if (f.basis === 'upperLimit' || f.basis === 'safeLevel') {
    const ul = referenceValues.find((x) => x.nutrient === id)?.upperLimit;
    if (ul?.url) list.push({ label: ul.source, url: ul.url });
  }
  return list.filter((s, i) => list.findIndex((x) => x.url === s.url) === i);
}
