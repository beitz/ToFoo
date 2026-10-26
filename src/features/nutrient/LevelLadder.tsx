import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { infoId, NUTRIENT_INFO_SOURCES, type InfoSource } from '../../i18n/nutrientInfo.en';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { ladderRungs, youAt, type Rung, type RungKind } from '../../logic/ladder';
import type { Requirement } from '../../model/requirements';
import type { NutrientResult } from '../../model/simulate';
import { Icon } from '../../ui/Icon';
import { StatusMark } from '../../ui/Tile';
import { ladder, type BodySign, type GoesAway, type LadderStep, type Onset } from '../../../model/ladder';
import { referenceMargin, type EffectSeverity } from '../../../model/effects';
import { statusThresholds } from '../../../model/parameters';
import { referenceValues } from '../../../model/reference-values';

/** Icon per body sign (see `BodySign` in model/ladder.ts). */
const SIGN_ICON: Record<BodySign, string> = {
  tired: 'battery',
  blood: 'drop',
  bleeding: 'bleed',
  bones: 'bone',
  joints: 'joint',
  muscles: 'muscle',
  nerves: 'nerve',
  brain: 'brain',
  head: 'head',
  skin: 'skin',
  hair: 'hair',
  mouth: 'mouth',
  teeth: 'tooth',
  eyes: 'eye',
  immune: 'shield',
  heart: 'heart',
  pressure: 'gauge',
  gut: 'gut',
  kidneys: 'kidney',
  liver: 'liver',
  thyroid: 'thyroid',
  pregnancy: 'baby',
  weight: 'scale',
};

const SEVERITY_STEPS: EffectSeverity[] = ['mild', 'moderate', 'serious'];
const ONSETS: Onset[] = ['days', 'weeks', 'months', 'years'];

/** The id of the ladder's fold, so "What your levels mean" at the top can open it. */
export const LADDER_ID = 'level-ladder';

/** Opens the ladder fold and scrolls to it (from the card at the top of the page). */
export function openLadder() {
  const el = document.getElementById(LADDER_ID);
  if (!(el instanceof HTMLDetailsElement)) return;
  el.open = true;
  // Your own step opens too: that is what the card at the top was about.
  const here = el.querySelector('.rung-here > details');
  if (here instanceof HTMLDetailsElement) here.open = true;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/** Whether a nutrient gets a ladder (info-only nutrients keep the plain "too little / too much" rows). */
export function hasLadder(r: NutrientResult): boolean {
  return r.kind !== 'info';
}

/**
 * "From too little to too much" (owner's ask, 2026-10-26: more detail on what a little low, very low,
 * extremely low or far too much does, with sources, without a wall of text): every step of the
 * nutrient from almost none to far too much, the user's own step tagged, each step opening what happens,
 * where it shows, how fast, whether it goes away, who gets it and its sources.
 */
export function LevelLadder({ id, r }: { id: string; r: NutrientResult }) {
  const d = useData();
  const key = infoId(id);
  const req = d.requirements.byNutrient.get(id);
  const rungs = ladderRungs(key, { info: r.kind === 'info', limitOnly: r.kind === 'limit', hasUpper: !!req?.upperLimit });
  if (!rungs.length) return null;
  const you = youAt(key, r, req, rungs);
  const store = !!r.store;
  return (
    <details className="fold" id={LADDER_ID}>
      <summary className="fold-row">
        <Icon name="ladder" size={18} />
        <span className="grow">{t('ladder.title')}</span>
        <Icon name="down" size={16} />
      </summary>
      <div className="small fold-body">
        <p className="muted ladder-intro">{t('ladder.intro')}</p>
        <ol className="ladder">
          {rungs.map((rung) => (
            <RungRow key={rung.kind} id={id} rung={rung} r={r} req={req} store={store} you={you?.kind === rung.kind ? you : undefined} />
          ))}
        </ol>
        {you && <p className="muted ladder-note">{t('ladder.whyTag', { basis: basisText(r) })}</p>}
      </div>
    </details>
  );
}

function RungRow({ id, rung, r, req, store, you }: { id: string; rung: Rung; r: NutrientResult; req: Requirement | undefined; store: boolean; you?: { unsure: boolean } }) {
  const key = infoId(id);
  const own = (part: string) => text(`ladder.${key}.${rung.kind === 'plenty' ? 'over' : rung.kind}${part}`);
  const step = rung.step;
  const line = rungLine(key, rung, store, !!req?.limitOnly);
  const how = step ? own('.how') : rung.kind === 'bitLow' ? t('ladder.generic.bitLowHow', { margin: `${Math.round(referenceMargin.value.low * 100)}–${fmtPercent(referenceMargin.value.high)}` }) : undefined;
  const signTexts = step?.signs?.length ? (own('.signs') ?? '').split(' · ') : [];
  const who = step ? own('.who') : undefined;
  const sources = rungSources(id, rung, req);
  const amount = amountLabel(id, rung, r, req, store);
  const name = t(`ladder.step.${stepName(rung.kind, req)}` as MessageKey);
  const more = !!(how || signTexts.length || who || step?.goesAway || step?.onset || sources.length);
  const head = (
    <>
      <span className="rung-top">
        <StatusMark status={rung.status} size={12} />
        <span className="rung-name">{name}</span>
        {you && (
          <span className="rung-you" aria-label={t('ladder.youSpoken')}>
            {t(you.unsure ? 'ladder.youUnclear' : 'ladder.you')}
          </span>
        )}
        {amount && <span className="rung-amt">{amount}</span>}
        {more && <Icon name="down" size={14} />}
      </span>
      {line && <span className="rung-line">{line}</span>}
      {step && (step.severity || step.onset) && (
        <span className="rung-meta">
          {step.severity ? (
            <>
              <SevDots severity={step.severity} /> {t(`levels.severity.${step.severity}` as MessageKey)}
            </>
          ) : null}
          {step.severity && step.onset ? ' · ' : null}
          {step.onset ? t(`ladder.onset.${step.onset}` as MessageKey) : null}
        </span>
      )}
    </>
  );
  return (
    <li className={`rung rung-${rung.kind}${you ? ' rung-here' : ''}`}>
      {more ? (
        <details className="rung-fold">
          <summary>{head}</summary>
          <div className="rung-body">
            {how && (
              <div>
                <h4 className="rung-label">{t('ladder.label.how')}</h4>
                <p>{how}</p>
              </div>
            )}
            {signTexts.length > 0 && step?.signs && (
              <div>
                <h4 className="rung-label">{t('ladder.label.signs')}</h4>
                <ul className="sign-chips">
                  {step.signs.map((s, i) => (
                    <li key={i} className="sign-chip">
                      <Icon name={SIGN_ICON[s]} size={15} />
                      {signTexts[i] ?? ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {step?.onset && <OnsetStrip onset={step.onset} />}
            {step?.goesAway && <GoesAwayRow value={step.goesAway} />}
            {who && (
              <p className="rung-row">
                <Icon name="person" size={16} />
                <span>
                  <strong>{t('ladder.who')}:</strong> {who}
                </span>
              </p>
            )}
            {sources.length > 0 && (
              <div className="muted rung-sources">
                {t('ladder.sources')}:{' '}
                {sources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && ' · '}
                    <a href={s.url} target="_blank" rel="noreferrer">
                      {s.label}
                    </a>
                  </span>
                ))}
              </div>
            )}
          </div>
        </details>
      ) : (
        <div className="rung-static">{head}</div>
      )}
    </li>
  );
}

function SevDots({ severity }: { severity: EffectSeverity }) {
  const n = SEVERITY_STEPS.indexOf(severity);
  return (
    <span className="sev-dots" role="img" aria-label={t('levels.severitySpoken', { n: n + 1 })}>
      {SEVERITY_STEPS.map((s, i) => (
        <span key={s} className={i <= n ? 'sev-dot on' : 'sev-dot'} />
      ))}
    </span>
  );
}

/** Days, weeks, months, years, with a dot on how long it takes to show. */
function OnsetStrip({ onset }: { onset: Onset }) {
  return (
    <div>
      <h4 className="rung-label">{t('ladder.label.onset')}</h4>
      <ol className="onset-strip">
        {ONSETS.map((o) => (
          <li key={o} className={o === onset ? 'hit' : undefined} aria-current={o === onset ? 'true' : undefined}>
            {t(`ladder.onset.${o}` as MessageKey)}
          </li>
        ))}
      </ol>
    </div>
  );
}

function GoesAwayRow({ value }: { value: GoesAway }) {
  return (
    <p className="rung-row">
      <Icon name="undo" size={16} />
      <span>
        <strong>{t('ladder.goesAway')}:</strong> {t(`ladder.goesAway.${value}` as MessageKey)}
      </span>
    </p>
  );
}

/** A text if it exists (t() returns the key itself for a missing one). */
function text(key: string): string | undefined {
  const v = t(key as MessageKey);
  return v === key ? undefined : v;
}

/** The step's own line, or the general text for a step nothing specific is described for. */
export function rungLine(key: string, rung: Rung, store: boolean, limitOnly: boolean): string {
  switch (rung.kind) {
    case 'farOver':
      return text(`ladder.${key}.farOver`) ?? '';
    case 'over':
    case 'plenty':
      // With a "far too much" step below it, the general text would say the same again.
      return (rung.step && text(`ladder.${key}.over`)) ?? (ladder[key]?.farOver ? undefined : text(`info.${key}.high`)) ?? t('ladder.generic.plenty');
    case 'enough':
      return t(limitOnly ? 'ladder.generic.enoughLimit' : store ? 'ladder.generic.enoughStore' : 'ladder.generic.enough');
    case 'bitLow':
      return t('ladder.generic.bitLow');
    case 'low':
      return (rung.step && text(`ladder.${key}.low`)) ?? t(store ? 'ladder.generic.storeLow' : 'ladder.generic.low');
    case 'none':
      return (rung.step && text(`ladder.${key}.none`)) ?? text(`info.${key}.low`) ?? '';
  }
}

function stepName(kind: RungKind, req: Requirement | undefined): string {
  if (kind === 'over') return req?.upperLimit?.safeLevel ? 'overSafe' : 'over';
  if (kind === 'enough' && req?.limitOnly) return 'underLimit';
  return kind;
}

function amountLabel(id: string, rung: Rung, r: NutrientResult, req: Requirement | undefined, store: boolean): string | undefined {
  const th = store ? statusThresholds.tank.value : statusThresholds.rolling.value;
  const pct = (v: number) => fmtPercent(v);
  switch (rung.kind) {
    case 'farOver': {
      const a = rung.step?.amount;
      if (a === undefined) return rung.step?.fromSupplements ? t('ladder.amount.supplements') : undefined;
      return t(rung.step?.fromSupplements ? 'ladder.amount.overSupplements' : 'ladder.amount.over', { amount: fmtAmount(id, a) });
    }
    case 'over': {
      const v = req?.upperLimit?.value ?? r.limit;
      return v !== undefined ? t('ladder.amount.over', { amount: fmtAmount(id, v) }) : undefined;
    }
    case 'plenty':
      return t('ladder.amount.noLimit');
    case 'enough':
      if (req?.limitOnly) return r.limit !== undefined ? t('ladder.amount.under', { amount: fmtAmount(id, r.limit) }) : undefined;
      return store ? t('ladder.amount.storeOver', { pct: pct(th.gettingLow) }) : t('ladder.amount.pctOrMore', { pct: pct(th.gettingLow) });
    case 'bitLow':
      return t(store ? 'ladder.amount.storeRange' : 'ladder.amount.pctRange', { from: String(Math.round(th.low * 100)), to: pct(th.gettingLow) });
    case 'low':
      return t(store ? 'ladder.amount.storeUnder' : 'ladder.amount.pctUnder', { pct: pct(th.low) });
    case 'none': {
      const a = rung.step?.amount;
      return a !== undefined ? t('ladder.amount.under', { amount: fmtAmount(id, a) }) : undefined;
    }
  }
}

/** The step's sources; for the general steps, what they rest on (the DGE margin, the upper limit, the nutrient's own source). */
function rungSources(id: string, rung: Rung, req: Requirement | undefined): InfoSource[] {
  const key = infoId(id);
  const list: InfoSource[] = [];
  const step: LadderStep | undefined = rung.step;
  if (step?.url) list.push({ label: step.source, url: step.url });
  for (const a of step?.also ?? []) list.push({ label: a.source, url: a.url });
  if (rung.kind === 'over') {
    const ul = referenceValues.find((x) => x.nutrient === id)?.upperLimit;
    if (req?.upperLimit && ul?.url) list.push({ label: ul.source, url: ul.url });
  }
  if (rung.kind === 'bitLow' && referenceMargin.url) list.push({ label: referenceMargin.source, url: referenceMargin.url });
  // A step shown with the general text cites the nutrient's own source.
  if (!step && (rung.kind === 'none' || rung.kind === 'plenty' || rung.kind === 'over')) {
    const own = NUTRIENT_INFO_SOURCES[key];
    if (own) list.push(own);
  }
  return list.filter((s, i) => list.findIndex((x) => x.url === s.url) === i);
}

function basisText(r: NutrientResult): string {
  if (r.store) return t('ladder.basis.store');
  return t(r.kind === 'limit' ? 'ladder.basis.limit' : 'ladder.basis.rolling', { days: r.windowDays });
}
