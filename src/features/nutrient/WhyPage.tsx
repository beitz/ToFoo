import { logTrust } from '../../../model/log-trust';
import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { formatDay } from '../../lib/dates';
import { fmtAmount, fmtFill, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Confidence, Cited, Range } from '../../model/paramTypes';
import type { NutrientResult } from '../../model/simulate';
import { fatSoluble, iron, nutrientParams, storage } from '../../../model/parameters';
import { referenceValues } from '../../../model/reference-values';
import { hasNoData } from '../../ui/Gauge';
import { BackButton } from '../../ui/BackButton';
import { Icon } from '../../ui/Icon';
import { markersFor } from './BloodTests';

/** Step markers in the chain, as in the design: what goes in, × share, = result, ÷ need, − use, → store. */
type Op = 'in' | 'times' | 'divide' | 'minus' | 'equals' | 'store';
const OP_SIGN: Record<Op, string> = {
  in: '',
  times: '×',
  divide: '÷',
  minus: '−',
  equals: '=',
  store: '→',
};

interface Step {
  op: Op;
  label: string;
  value: string;
  range?: string;
  note?: ReactNode;
  last?: boolean;
}

const CONF_ORDER: Confidence[] = ['assumption', 'low', 'medium', 'high'];
const weakest = (cs: Confidence[]) => cs.reduce((w, c) => (CONF_ORDER.indexOf(c) < CONF_ORDER.indexOf(w) ? c : w), 'high' as Confidence);

/** Where the share taken up comes from: the meal rule's main source, the fixed share otherwise. */
function uptakeSource(id: string): Cited | undefined {
  const p = nutrientParams[id];
  if (!p) return undefined;
  const rule = p.rule;
  if (rule.type === 'iron') return iron.nonheme;
  if (rule.type === 'saturable') return rule.activeFraction;
  if (rule.type === 'doseTable') return rule.points;
  if (rule.type === 'doseLog') return rule;
  return p.typicalAbsorption.value === 1 ? undefined : p.typicalAbsorption;
}

const rangeText = (id: string, r: Range, per: string) => `${fmtAmount(id, r.low)}–${fmtAmount(id, r.high)}${per}`;

/**
 * "Why 62 %?" (design 2026-10-22, replaces the planned "How is this calculated?" sheet): the
 * number taken apart step by step, from the food to the need (and, for a store, to the fill level),
 * how sure it is and where each part comes from. Short for nutrients without uptake or store.
 */
export function WhyPage({ id }: { id: string }) {
  const d = useData();
  const def = NUTRIENT_BY_ID.get(id);
  const r = d.model.nutrients.get(id);
  const req = d.requirements.byNutrient.get(id);
  if (!def || !r) return <p>{t('nutrient.unknown')}</p>;
  const ref = referenceValues.find((x) => x.nutrient === id);
  const uptake = uptakeSource(id);
  const store = r.store;
  const per = `/${t('nutrient.day')}`;
  const noData = hasNoData(r);
  const steps = noData ? [] : chain(r, req, uptake !== undefined, per);
  const headline = noData ? '–' : store ? t('gauge.full', { pct: fmtFill(store.fill.central) }) : r.kind === 'info' ? `${fmtAmount(id, r.averageIntake)}${per}` : fmtPercent(r.value.central);

  const storeModel = storage[id];
  const storeCited = storeModel?.kind === 'tank' ? storeModel.capacity : storeModel?.kind === 'tankDays' ? storeModel.capacityDays : undefined;
  const confidences = [ref?.confidence, uptake?.confidence, nutrientParams[id]?.fatSoluble ? fatSoluble.minFactor.confidence : undefined, store ? storeCited?.confidence : undefined].filter(
    (c): c is Confidence => !!c,
  );
  const sure = confidences.length ? weakest(confidences) : undefined;
  const bloodTest = store?.slow && !store.measuredOn && markersFor(id).length > 0;

  const sources: Array<{
    what: string;
    title: string;
    sub?: string;
    to?: string;
    external?: boolean;
  }> = [
    {
      what: t('why.srcFoods'),
      title: t('why.srcFoodsTitle'),
      sub: r.missingDataDays > 0 ? t('why.srcFoodsMissing', { n: r.missingDataDays }) : undefined,
      to: href('about'),
    },
    ...(ref && req && !req.own
      ? [
          {
            what: t('why.srcNeed'),
            title: ref.source,
            sub: t('why.srcNeedSub'),
            ...(ref.url ? { to: ref.url, external: true } : {}),
          },
        ]
      : []),
    ...(req?.own
      ? [
          {
            what: t('why.srcNeed'),
            title: t('why.srcOwn'),
            to: href('settings', 'profile'),
          },
        ]
      : []),
    ...(uptake
      ? [
          {
            what: t('why.srcUptake'),
            title: uptake.source,
            ...(uptake.url ? { to: uptake.url, external: true } : {}),
          },
        ]
      : []),
    ...(nutrientParams[id]?.fatSoluble
      ? [
          {
            what: t('why.srcFat'),
            title: fatSoluble.minFactor.source,
            ...(fatSoluble.minFactor.url ? { to: fatSoluble.minFactor.url, external: true } : {}),
          },
        ]
      : []),
    ...(store && storeCited
      ? [
          {
            what: t('why.srcStore'),
            title: storeCited.source,
            ...(storeCited.url ? { to: storeCited.url, external: true } : {}),
          },
        ]
      : []),
    ...(store
      ? [
          store.measuredOn
            ? {
                what: t('why.srcStart'),
                title: t('why.srcStartTest'),
                sub: formatDay(store.measuredOn, d.today),
                to: href('nutrient', id),
              }
            : {
                what: t('why.srcStart'),
                title: t(`start.${d.profile.startingLevel}` as MessageKey),
                sub: t('why.srcStartSub'),
                to: href('settings', 'start'),
              },
        ]
      : []),
  ];

  return (
    <section className="why-page">
      <header className="page-head row">
        <BackButton />
        <div className="grow">
          <h1>{t(store ? 'why.titleStore' : 'why.title', { value: headline })}</h1>
          <p className="muted small">{t('why.sub', { name: def.name, days: r.windowDays })}</p>
        </div>
      </header>

      {noData ? (
        <p className="card muted">{t('why.noData')}</p>
      ) : (
        <ol className="plain-list why-chain">
          {steps.map((s, i) => (
            <li key={i} className={`card why-step${s.last ? ' why-last' : ''}`}>
              <span className="why-op" aria-hidden>
                {OP_SIGN[s.op]}
              </span>
              <div className="why-body">
                <div className="row-between why-head">
                  <span>{s.label}</span>
                  <strong className="why-value">{s.value}</strong>
                </div>
                {s.range && <p className="muted small why-range">{t('why.likely', { range: s.range })}</p>}
                {s.note && <p className="small">{s.note}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {sure && (
        <div className="card why-sure">
          <div className="row-between">
            <strong>{t('why.sure')}</strong>
            <span>{t(`conf.${sure}` as MessageKey)}</span>
          </div>
          <div className="why-sure-bar" aria-hidden>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < Math.max(1, CONF_ORDER.indexOf(sure)) ? 'on' : ''} />
            ))}
          </div>
          <p className="small">
            {t(`why.sure.${sure}` as MessageKey)}
            {bloodTest ? ` ${t('why.sureTest')}` : ''}
          </p>
          {logTrust[id] && (
            <p className="small">
              <Icon name="eye" size={14} /> <strong>{t(`trust.chip.${logTrust[id].trust}`)}.</strong> {t(`trust.reason.${logTrust[id].reason}`)}
            </p>
          )}
        </div>
      )}

      <h2 className="section-title">{t('why.sources')}</h2>
      <ul className="plain-list card why-sources">
        {sources.map((s) => (
          <li key={s.what + s.title}>
            {s.to ? (
              <a className="why-source" href={s.to} {...(s.external ? { target: '_blank', rel: 'noreferrer' } : {})}>
                <SourceBody {...s} />
                <Icon name="chevron" size={16} />
              </a>
            ) : (
              <div className="why-source">
                <SourceBody {...s} />
              </div>
            )}
          </li>
        ))}
      </ul>
      <p className="muted small">{t('why.model')}</p>
      <p className="muted small">{t('nutrient.notAdvice')}</p>
    </section>
  );
}

/** A citation reads "Who (year) where: what they found"; the list shows who and where, the finding below, cut short. */
function SourceBody({ what, title, sub }: { what: string; title: string; sub?: string }) {
  const cut = title.indexOf(': ');
  const head = cut > 0 ? title.slice(0, cut) : title;
  const detail = cut > 0 ? title.slice(cut + 2) : undefined;
  return (
    <>
      <span className="why-source-what muted small">{what}</span>
      <span className="grow why-source-main">
        {head}
        {sub && <span className="muted small why-source-sub">{sub}</span>}
        {detail && <span className="muted small why-source-detail">{detail}</span>}
      </span>
    </>
  );
}

/** The steps from food to the number shown. */
function chain(
  r: NutrientResult,
  req:
    | {
        recommended: number;
        physiological: number;
        physiologicalDerived?: boolean;
        own?: unknown;
        limitOnly?: boolean;
      }
    | undefined,
  uptakeModelled: boolean,
  per: string,
): Step[] {
  const id = r.id;
  const food: Step = {
    op: 'in',
    label: t('why.inFood'),
    value: `${fmtAmount(id, r.averageIntake)}${per}`,
    note:
      r.missingDataDays > 0
        ? t('why.inFoodMissing', { n: r.missingDataDays })
        : r.knownDays < r.windowDays
          ? t('why.inFoodDays', { known: r.knownDays, days: r.windowDays })
          : t('why.inFoodAll', { days: r.windowDays }),
  };
  if (r.kind === 'info' || !req) return [{ ...food, last: true }];
  if (r.kind === 'limit') {
    return [
      food,
      {
        op: 'equals',
        label: t('why.ofLimit', {
          limit: `${fmtAmount(id, r.limit ?? req.recommended)}${per}`,
        }),
        value: fmtPercent(r.value.central),
        last: true,
        note: t(req.own ? 'why.limitOwn' : 'why.limitRef'),
      },
    ];
  }
  const store = r.store;
  const need = req.physiological;
  // A store's chain must add up to its daily change, so "taken up" is need + change (sun included for vitamin D).
  const absorbed = store?.netPerDay !== undefined ? Math.max(0, need + store.netPerDay) : r.averageAbsorbed;
  const steps: Step[] = [food];
  if (uptakeModelled) {
    if (id !== 'VITD' && r.averageIntake > 0)
      steps.push({
        op: 'times',
        label: t('why.takenUpShare'),
        value: fmtPercent(absorbed / r.averageIntake),
        note: t(`why.uptake.${uptakeKind(id)}` as MessageKey),
      });
    steps.push({
      op: 'equals',
      label: t(id === 'VITD' ? 'why.takenUpSun' : 'why.takenUp'),
      value: `${fmtAmount(id, absorbed)}${per}`,
      ...(!store && id !== 'FE' && r.value.high - r.value.low > 0.02
        ? {
            range: rangeText(
              id,
              {
                low: r.value.low * need,
                central: 0,
                high: r.value.high * need,
              },
              per,
            ),
          }
        : {}),
    });
  }
  const needLabel = uptakeModelled ? t('why.used') : t(req.own ? 'why.ownTarget' : 'why.recommended');
  const needValue = uptakeModelled ? need : req.recommended;
  if (!store) {
    steps.push({
      op: 'divide',
      label: needLabel,
      value: `${fmtAmount(id, needValue)}${per}`,
      note: req.own
        ? t('why.needOwn')
        : uptakeModelled && req.physiologicalDerived
          ? t('why.needDerived', {
              rec: `${fmtAmount(id, req.recommended)}${per}`,
            })
          : t('why.needRef'),
    });
    steps.push({
      op: 'equals',
      label: t('why.ofNeed'),
      value: fmtPercent(r.value.central),
      ...(r.value.high - r.value.low > 0.02 ? { range: `${fmtPercent(r.value.low)}–${fmtPercent(r.value.high)}` } : {}),
      note: id === 'FE' ? t('why.ironRef') : t('why.average', { days: r.windowDays }),
      last: true,
    });
    return steps;
  }
  steps.push({
    op: 'minus',
    label: needLabel,
    value: `${fmtAmount(id, need)}${per}`,
    note: t('why.needRef'),
  });
  if (store.netPerDay !== undefined) {
    const sign = store.netPerDay >= 0 ? '+' : '−';
    steps.push({
      op: 'equals',
      label: t('why.change'),
      value: `${sign}${fmtAmount(id, Math.abs(store.netPerDay))}${per}`,
      note: t(store.netPerDay < 0 ? 'why.changeDown' : store.netPerDay > 0 ? 'why.changeUp' : 'why.changeSteady', { week: `${sign}${fmtAmount(id, Math.abs(store.netPerDay * 7))}` }),
    });
  }
  steps.push({
    op: 'store',
    label: t('why.store'),
    value: fmtFill(store.fill.central),
    ...(store.fill.high - store.fill.low > 0.02 ? { range: `${fmtFill(store.fill.low)}–${fmtFill(store.fill.high)}` } : {}),
    note: t(store.measuredOn ? 'why.storeTest' : 'why.storeStart', {
      size: fmtAmount(id, store.capacity),
    }),
    last: true,
  });
  return steps;
}

function uptakeKind(id: string): string {
  const p = nutrientParams[id];
  if (!p) return 'fixed';
  if (p.rule.type !== 'fixed') return p.rule.type;
  return p.fatSoluble ? 'fat' : 'fixed';
}
