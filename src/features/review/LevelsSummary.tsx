import { Fragment, useMemo } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { hasEffectText } from '../../i18n/effects.en';
import { infoId } from '../../i18n/nutrientInfo.en';
import { summarise, type Finding } from '../../logic/effects';
import { NUTRIENT_BY_ID, NUTRIENTS } from '../../model/nutrients';
import type { NutrientResult } from '../../model/simulate';
import { isOn } from '../../settings/features';
import { Icon } from '../../ui/Icon';
import { StatusMark } from '../../ui/Tile';

/** Names in the closed line before "+n more". */
const PREVIEW = 2;

const nameOf = (id: string) => NUTRIENT_BY_ID.get(id)?.name ?? id;

/**
 * "What your levels mean" on Insights (owner's ask, 2026-10-23): one line that opens to what the
 * nutrients that are low or too much can do, each opening its page; then short lines for the rest
 * (a bit low, filling, too early to tell, close to the line, only own goals, no known effect, enough, no data). Same results as Home and
 * the nutrient pages, so the words match.
 */
export function LevelsSummary({ reviewHref }: { reviewHref: string }) {
  const d = useData();
  const hidden = useMemo(() => new Set(d.settings.hiddenNutrients), [d.settings.hiddenNutrients]);
  const sum = useMemo(() => {
    const results = NUTRIENTS.map((n) => d.model.nutrients.get(n.id)).filter((r): r is NutrientResult => !!r);
    return summarise(results, d.requirements.byNutrient, hasEffectText, hidden);
  }, [d.model, d.requirements, hidden]);
  if (!isOn(d.settings.features, 'levelEffects')) return null;
  const days = d.settings.shortWindowDays;
  const preview = sum.effects.slice(0, PREVIEW);
  const counted = sum.effects.length + sum.aBitLow.length + sum.filling.length + sum.early.length + sum.unsure.length + sum.ownOnly.length + sum.noEffect.length + sum.fine.length;
  if (counted === 0) return null;

  return (
    <details className="card ov-card fold levels-sum" data-tour="insights.levels">
      <summary className="ov-row">
        <Icon name="info" size={20} />
        <span className="ov-text">
          <span className="ov-title">{t('levels.title')}</span>
          <span className="ov-sub">
            {preview.length === 0
              ? t('levels.nothing')
              : preview.map((f) => (
                  <span key={f.id} className="levels-chip">
                    <StatusMark status={f.status} size={11} /> {nameOf(f.id)}
                  </span>
                ))}
            {sum.effects.length > PREVIEW && <span>{t('levels.more', { n: sum.effects.length - PREVIEW })}</span>}
          </span>
        </span>
        <Icon name="down" size={16} />
      </summary>
      <div className="levels-body">
        {sum.effects.length > 0 && (
          <ul className="plain-list levels-list">
            {sum.effects.map((f) => (
              <li key={f.id}>
                <a className="levels-item" href={href('nutrient', f.id)}>
                  <StatusMark status={f.status} size={14} />
                  <span className="grow">
                    <strong>{nameOf(f.id)}</strong> <span className="muted">{t(`statusWord.${f.status}` as MessageKey)}</span>
                    <span className="small levels-effect">{t(`effect.${infoId(f.id)}.${f.direction}` as MessageKey)}</span>
                  </span>
                  <Icon name="chevron" size={16} />
                </a>
              </li>
            ))}
          </ul>
        )}
        <Group label={t('levels.aBitLow')} items={sum.aBitLow} />
        <Group label={t('levels.filling')} items={sum.filling} />
        <Group label={t('levels.early')} items={sum.early} />
        <Group label={t('levels.unsure')} items={sum.unsure} />
        <Group label={t('levels.ownOnly')} items={sum.ownOnly} />
        <Group label={t('levels.noEffect')} items={sum.noEffect} />
        {sum.fine.length > 0 && (
          <a className="small levels-group levels-fine" href={reviewHref}>
            <span className="grow">
              <StatusMark status="fine" size={12} /> <strong>{t('levels.fine')}</strong> ({t('levels.fineCount', { n: sum.fine.length })}): <span className="muted">{sum.fine.map(nameOf).join(', ')}</span>
            </span>
            <Icon name="chevron" size={16} />
          </a>
        )}
        {sum.noData.length > 0 && (
          <p className="small levels-group muted">
            {t('levels.noData')}: {sum.noData.map(nameOf).join(', ')}
          </p>
        )}
        <p className="small muted">{t('levels.note', { days })}</p>
      </div>
    </details>
  );
}

/** A short line of names, each opening its nutrient page. */
function Group({ label, items }: { label: string; items: Finding[] }) {
  if (items.length === 0) return null;
  return (
    <p className="small levels-group">
      <strong>{label}</strong>:{' '}
      {items.map((f, i) => (
        <Fragment key={f.id}>
          {i > 0 && ' '}
          <a className="levels-name" href={href('nutrient', f.id)}>
            <StatusMark status={f.status} size={11} /> {nameOf(f.id)}
          </a>
        </Fragment>
      ))}
    </p>
  );
}
