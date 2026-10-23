import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { EFFECT_SOURCES, hasEffectText } from '../../i18n/effects.en';
import { infoId, NUTRIENT_INFO_SOURCES, type InfoSource } from '../../i18n/nutrientInfo.en';
import { fmtFill, fmtNumber, fmtPercent } from '../../lib/format';
import { findingOf, type Finding } from '../../logic/effects';
import { effectFindings, effectSeverity, referenceMargin, upperLimitMeaning, type EffectFinding, type EffectSeverity } from '../../../model/effects';
import { referenceValues } from '../../../model/reference-values';
import type { Requirement } from '../../model/requirements';
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
  const sources = sourcesFor(r.id, f, req);

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
        {f.effect && <Seriousness id={r.id} f={f} req={req} />}
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
      // The salt guide is DGE's, not a toxicological upper limit: call it a limit.
      return t(efsaLimit(r.id) ? 'levels.upperLimit' : 'levels.limit', { days, pct: fmtPercent(r.ulRatio ?? 0) });
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

const SEVERITY_STEPS: EffectSeverity[] = ['mild', 'moderate', 'serious'];

/**
 * "How serious is it" (owner's ask, 2026-10-23: "is it 1 % more risk over 40 years, or will I die next
 * week?"): how bad the outcome is at worst, how big and likely from a systematic review where one exists,
 * and how much room the reference value or upper limit leaves.
 */
function Seriousness({ id, f, req }: { id: string; f: Finding; req: Requirement | undefined }) {
  const key = `${infoId(id)}.${f.direction}`;
  const severity = effectSeverity[key];
  const findings = effectFindings[key] ?? [];
  const margin = marginText(id, f, req);
  if (!severity && !findings.length && !margin) return null;
  return (
    <>
      <h3 className="level-sub">{t('levels.serious')}</h3>
      {severity && (
        <p className="level-severity">
          <span className="sev-dots" role="img" aria-label={t('levels.severitySpoken', { n: SEVERITY_STEPS.indexOf(severity) + 1 })}>
            {SEVERITY_STEPS.map((step, i) => (
              <span key={step} className={i <= SEVERITY_STEPS.indexOf(severity) ? 'sev-dot on' : 'sev-dot'} />
            ))}
          </span>
          <span>
            {t('levels.severityLead')} <strong>{t(`levels.severity.${severity}` as MessageKey)}</strong>, {t(`levels.severityText.${severity}` as MessageKey)}
          </span>
        </p>
      )}
      {findings.map((x, i) => (
        <p key={i}>{t(`effect.${key}Size${i + 1}` as MessageKey, findingVars(x))}</p>
      ))}
      {!findings.length && <p className="muted">{t('levels.noNumbers')}</p>}
      {margin && <p className="muted">{margin}</p>}
    </>
  );
}

/** Each number as `{name}` (the central value) and `{nameRange}` (low–high). */
export function findingVars(x: EffectFinding): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [name, { value, unit }] of Object.entries(x.numbers)) {
    if (unit === 'share') {
      vars[name] = fmtPercent(value.central);
      vars[`${name}Range`] = `${Math.round(value.low * 100)}–${fmtPercent(value.high)}`;
    } else {
      vars[name] = fmtNumber(value.central, 1);
      vars[`${name}Range`] = `${fmtNumber(value.low, 1)}–${fmtNumber(value.high, 1)}`;
    }
  }
  return vars;
}

/** EFSA's upper limit (not the DGE salt guide, which is no toxicological limit). */
const efsaLimit = (id: string) => referenceValues.find((x) => x.nutrient === id)?.upperLimit?.source.startsWith('EFSA') ?? false;

/** How much room the reference or the limit leaves: only where its derivation is sourced. */
function marginText(id: string, f: Finding, req: Requirement | undefined): string | undefined {
  const m = referenceMargin.value;
  if (f.basis === 'need' && req?.kind === 'recommended' && !req.own) return t('levels.marginNeed', { margin: `${Math.round(m.low * 100)}–${fmtPercent(m.high)}` });
  if (f.basis === 'upperLimit' && efsaLimit(id)) return t('levels.marginUpper');
  if (f.basis === 'safeLevel') return t('levels.marginSafe');
  return undefined;
}

/** The nutrient's own source, any for this direction, the findings', and what the margin line rests on; each once. */
export function sourcesFor(id: string, f: Finding, req?: Requirement): InfoSource[] {
  const key = infoId(id);
  const list: InfoSource[] = [];
  const own = NUTRIENT_INFO_SOURCES[key];
  if (own) list.push(own);
  list.push(...(EFFECT_SOURCES[`${key}.${f.direction}`] ?? []));
  if (f.effect) for (const x of effectFindings[`${key}.${f.direction}`] ?? []) if (x.url) list.push({ label: x.source, url: x.url });
  if (f.basis === 'upperLimit' || f.basis === 'safeLevel') {
    const ul = referenceValues.find((x) => x.nutrient === id)?.upperLimit;
    if (ul?.url) list.push({ label: ul.source, url: ul.url });
    if (f.effect && (f.basis === 'safeLevel' || efsaLimit(id)) && upperLimitMeaning.url) list.push({ label: upperLimitMeaning.source, url: upperLimitMeaning.url });
  }
  if (f.effect && f.basis === 'need' && req?.kind === 'recommended' && !req.own && referenceMargin.url) list.push({ label: referenceMargin.source, url: referenceMargin.url });
  return list.filter((s, i) => list.findIndex((x) => x.url === s.url) === i);
}
