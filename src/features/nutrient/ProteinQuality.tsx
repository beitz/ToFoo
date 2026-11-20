/**
 * "Protein quality" on the protein page and each essential amino acid's page (owner's ask, 2026-11-20:
 * which nutrients belong to protein, and more about it without asking an AI, deeper the more you tap).
 *
 * Three layers: the card shows the nine essential amino acids as small tiles (each opening its page) and
 * one row per topic; a row opens a sheet with a short lead, a table worked out from BLS where one helps,
 * and its sources. Numbers come from model/proteinQuality.ts, the WHO pattern and BLS, never from the text.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { lowerName, t, type MessageKey } from '../../i18n';
import { foodName } from '../../i18n/names';
import { fmtNumber, fmtPercent } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { Cited } from '../../model/paramTypes';
import { PROFILE_DEFAULTS } from '../../model/requirements';
import { currentWeight } from '../../logic/resolve';
import { complement, COMPLEMENT_EXAMPLE, lowestAmino, scoreTable } from '../../logic/proteinQuality';
import { aminoProfiles } from '../../foods/groupStats';
import { aminoAcidPattern } from '../../../model/reference-values';
import { antinutrients, diaasExamples, leucineFacts, perMealProtein, proteinDigestibility } from '../../../model/proteinQuality';
import { Sheet } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { InfoButton } from '../../ui/InfoButton';
import { StatusMark } from '../../ui/Tile';
import { hasNoData } from '../../ui/Gauge';
import { AminoKindTable, EAA_ORDER, GroupInfoLink, PROTEIN_KIND_KEYS } from '../info/GroupInfo';

const m = (key: string, vars?: Record<string, string | number>) => t(key as MessageKey, vars);

/** Sources that are not a number in model/: the reasons and advice in the texts. */
const WHO_2007: Source = { label: 'WHO/FAO/UNU (2007): Protein and amino acid requirements in human nutrition, WHO Technical Report Series 935 (sections 2.3 and 6)', url: 'https://iris.who.int/handle/10665/43411' };
const DGE_FAQ: Source = {
  label: 'DGE: Fragen und Antworten zu Protein und unentbehrlichen Aminosäuren (questions 2, 9 and 10)',
  url: 'https://www.dge.de/gesunde-ernaehrung/faq/ausgewaehlte-fragen-und-antworten-zu-protein-und-unentbehrlichen-aminosaeuren/',
};
const BLS: Source = { label: 'Max Rubner-Institut (2025): Bundeslebensmittelschlüssel (BLS) 4.0', url: 'https://doi.org/10.25826/Data20251217-134202-0' };

interface Source {
  label: string;
  url?: string;
}
/** Links inside a sheet close it first, as on the group pages, so Back doesn't land on a closed sheet. */
interface Nav {
  onNavigate: () => void;
}

const cited = (c: Cited): Source => ({ label: c.source, ...(c.url ? { url: c.url } : {}) });

/** Range of WHO's digestibility over some of its rows, e.g. animal foods 94–97 %. */
function digRange(keys: readonly string[]): { low: number; high: number } {
  const pcts = proteinDigestibility.value.filter((r) => keys.includes(r.key)).map((r) => r.pct);
  return { low: Math.min(...pcts), high: Math.max(...pcts) };
}
const ANIMAL = ['egg', 'milk', 'meatFish'];
const PLANT = ['beans', 'peas', 'wheatWhole', 'oatmeal'];

export function ProteinQuality({ id }: { id: string }) {
  const d = useData();
  const shares = EAA_ORDER.map((aa) => {
    const r = d.model.nutrients.get(aa);
    return { id: aa, r, share: r && !hasNoData(r) ? r.value.central : undefined };
  });
  const lowest = lowestAmino(shares);
  const title = t('pq.title');
  return (
    <div className="card protein-quality" data-tour="nutrient.protein">
      <div className="card-head">
        <h2>{title}</h2>
        <InfoButton title={title}>
          <p>{t('pq.info.what')}</p>
          <p>{t('pq.info.tiles')}</p>
          <p>{t('pq.info.pairs')}</p>
          <p className="muted">{t('pq.info.data')}</p>
          <GroupInfoLink group="protein" />
        </InfoButton>
      </div>
      <p className="small muted pq-grid-label">{t('pq.grid')}</p>
      <ul className="pq-grid">
        {shares.map(({ id: aa, r, share }) => {
          const def = NUTRIENT_BY_ID.get(aa)!;
          const name = aa === 'SAA' || aa === 'AAA' ? def.short : def.name;
          const pct = share === undefined ? '–' : fmtPercent(share);
          return (
            <li key={aa}>
              <a
                className={`pq-cell${aa === id ? ' pq-cell-here' : ''}`}
                href={href('nutrient', aa)}
                aria-current={aa === id ? 'page' : undefined}
                aria-label={t('pq.gridCell', { name: def.name, pct })}
              >
                <span className="pq-cell-value">
                  <StatusMark status={share === undefined || !r ? 'unknown' : r.status} size={12} /> {pct}
                </span>
                <span className="pq-cell-name">{name}</span>
              </a>
            </li>
          );
        })}
      </ul>
      <p className="small muted">
        {lowest ? t('pq.lowest', { name: lowerName(NUTRIENT_BY_ID.get(lowest.id)!.name), pct: fmtPercent(lowest.share) }) : t('pq.noData')}
      </p>
      <div className="pq-rows">
        <TopicRow icon="check" title={t('pq.row.short')}>
          {(close) => <InShort onNavigate={close} />}
        </TopicRow>
        <TopicRow icon="gut" title={t('pq.row.digest')}>
          {(close) => <Digestion onNavigate={close} />}
        </TopicRow>
        <TopicRow icon="bars" title={t('pq.row.scores')}>
          {(close) => <Scores onNavigate={close} />}
        </TopicRow>
        <TopicRow icon="swap" title={t('pq.row.mix')}>
          {(close) => <Mixing onNavigate={close} />}
        </TopicRow>
        <TopicRow icon="muscle" title={t('pq.row.leucine')}>
          {(close) => <Leucine onNavigate={close} />}
        </TopicRow>
      </div>
    </div>
  );
}

/** One topic: a row in the card that opens its sheet. */
function TopicRow({ icon, title, children }: { icon: string; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button type="button" className="pq-row" onClick={() => setOpen(true)}>
        <Icon name={icon} size={18} />
        <span className="grow">{title}</span>
        <Icon name="chevron" size={16} />
      </button>
      {open &&
        createPortal(
          <Sheet title={title} onClose={close}>
            <div className="group-info small">{children(close)}</div>
          </Sheet>,
          document.body,
        )}
    </>
  );
}

function Sources({ list }: { list: Source[] }) {
  return (
    <>
      <h3>{t('pq.sources')}</h3>
      <ul className="group-info-sources muted">
        {list.map((s) => (
          <li key={s.label}>
            {s.url ? (
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.label}
              </a>
            ) : (
              s.label
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function weightKg(d: ReturnType<typeof useData>): number {
  return currentWeight(d.profile) ?? PROFILE_DEFAULTS.weightKg;
}

function InShort(_: Nav) {
  const d = useData();
  const a = digRange(ANIMAL);
  const p = digRange(PLANT);
  const tofu = useMemo(() => complement([{ code: 'H861000', grams: 100 }], d.foods.byCode, aminoAcidPattern.value), [d.foods]);
  const meal = perMealProtein.value;
  const lines = [
    t('pq.short.enough'),
    t('pq.short.animal', { low: a.low, high: a.high }),
    t('pq.short.plant', { low: p.low, high: p.high }),
    t('pq.short.mix'),
    ...(tofu ? [t('pq.short.soy', { pct: fmtPercent(tofu.together.score) })] : []),
    t('pq.short.muscle', { g: fmtNumber(meal.gPerKg * weightKg(d)), hMin: meal.hoursMin, hMax: meal.hoursMax }),
  ];
  return (
    <>
      <ul className="group-info-list pq-short">
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
      <Sources list={[cited(diaasExamples), WHO_2007, DGE_FAQ, cited(leucineFacts), cited(perMealProtein), BLS]} />
    </>
  );
}

function Digestion(_: Nav) {
  const a = digRange(ANIMAL);
  const p = digRange(PLANT);
  const rows = [...proteinDigestibility.value].sort((x, y) => y.pct - x.pct);
  const an = antinutrients.value;
  return (
    <>
      <p>
        <strong>{t('pq.digest.lead', { aLow: a.low, aHigh: a.high, pLow: p.low, pHigh: p.high })}</strong>
      </p>
      <h3>{t('pq.digest.table')}</h3>
      <ul className="pq-bars" role="list">
        {rows.map((r) => (
          <li key={r.key} className="pq-bar-row">
            <span className="pq-bar-name">{m(`pq.dig.${r.key}`)}</span>
            <span className="pq-bar-track" aria-hidden>
              <span className="pq-bar-fill" style={{ width: `${r.pct}%` }} />
            </span>
            <span className="pq-bar-value">{fmtPercent(r.pct / 100)}</span>
          </li>
        ))}
      </ul>
      <p>{t('pq.digest.why', { phytate: an.phytateUpToPct, tannins: an.tanninsUpToPct, trypsin: an.trypsinInhibitorsUpToPct })}</p>
      <p>{t('pq.digest.cooking')}</p>
      <p className="muted">{t('pq.digest.tofoo')}</p>
      <Sources list={[cited(proteinDigestibility), cited(antinutrients), DGE_FAQ, WHO_2007]} />
    </>
  );
}

function Scores({ onNavigate }: Nav) {
  const d = useData();
  const rows = useMemo(() => scoreTable(proteinDigestibility.value, d.foods.byCode, aminoAcidPattern.value), [d.foods]);
  const x = diaasExamples.value;
  return (
    <>
      <p>
        <strong>{t('pq.scores.lead')}</strong>
      </p>
      <p>{t('pq.scores.pdcaas')}</p>
      <h3>{t('pq.scores.table')}</h3>
      <div className="table-scroll">
        <table className="nutrient-table group-info-table">
          <thead>
            <tr>
              <th scope="col">{t('pq.digest.colFood')}</th>
              <th scope="col" className="num">
                {t('pq.scores.colLowest')}
              </th>
              <th scope="col" className="num">
                {t('pq.digest.colPct')}
              </th>
              <th scope="col" className="num">
                {t('pq.scores.colPdcaas')}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row.key}>
                <th scope="row">
                  <a href={href('food', r.food.code)} onClick={onNavigate}>
                    {foodName(r.food)}
                  </a>
                </th>
                <td className="num">
                  {NUTRIENT_BY_ID.get(r.aminoScore.limiting)?.short} {fmtPercent(r.aminoScore.score)}
                </td>
                <td className="num">{fmtPercent(r.row.pct / 100)}</td>
                <td className="num">
                  <strong>{fmtNumber(r.pdcaas, 2)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">{t('pq.scores.note')}</p>
      <p>{t('pq.scores.diaas', { excellent: x.excellent, good: x.good, goodTop: x.excellent - 1 })}</p>
      <p>
        {t('pq.scores.diaasExamples', {
          milk: x.milkPowder,
          wheat: x.mixGrams.wheat,
          peas: x.mixGrams.peas,
          milkPowder: x.mixGrams.milkPowder,
          mix: x.mix,
        })}
      </p>
      <p className="muted">{t('pq.scores.diaasWhy')}</p>
      <p>{t('pq.scores.adjust')}</p>
      <Sources list={[WHO_2007, cited(diaasExamples), cited(proteinDigestibility), BLS]} />
    </>
  );
}

function Mixing({ onNavigate }: Nav) {
  const d = useData();
  const ex = useMemo(() => complement(COMPLEMENT_EXAMPLE, d.foods.byCode, aminoAcidPattern.value), [d.foods]);
  const short = (aa: string) => lowerName(NUTRIENT_BY_ID.get(aa)?.name ?? aa);
  const bars = ex
    ? [
        ...ex.parts.map((p) => ({ key: p.food.code, label: t('pq.mix.part', { grams: fmtNumber(p.grams), food: foodName(p.food) }), score: p.score, href: href('food', p.food.code) })),
        { key: 'both', label: t('pq.mix.together'), score: ex.together, href: undefined },
      ]
    : [];
  const top = Math.max(1, ...bars.map((b) => b.score.score));
  return (
    <>
      <p>
        <strong>{t('pq.mix.lead')}</strong>
      </p>
      {ex && (
        <>
          <h3>{t('pq.mix.example')}</h3>
          <ul className="pq-bars pq-mix" role="list">
            {bars.map((b) => (
              <li key={b.key} className={`pq-bar-row${b.key === 'both' ? ' pq-bar-total' : ''}`}>
                <span className="pq-bar-name">
                  {b.href ? (
                    <a href={b.href} onClick={onNavigate}>
                      {b.label}
                    </a>
                  ) : (
                    b.label
                  )}
                  <span className="muted"> · {t('pq.mix.lowestOf', { name: short(b.score.limiting) })}</span>
                </span>
                <span className="pq-bar-track" aria-hidden>
                  <span className={`pq-bar-fill${b.score.score < 1 ? ' pq-bar-short' : ''}`} style={{ width: `${(b.score.score / top) * 100}%` }} />
                  <span className="pq-bar-need" style={{ left: `calc(${(1 / top) * 100}% - 1px)` }} />
                </span>
                <span className="pq-bar-value">{fmtPercent(b.score.score)}</span>
              </li>
            ))}
          </ul>
          <p className="muted">{t('pq.mix.note')}</p>
        </>
      )}
      <p>{t('pq.mix.when')}</p>
      <p>{t('pq.mix.digestion')}</p>
      <p>{t('pq.mix.pairs')}</p>
      <h3>{t('pq.mix.kinds')}</h3>
      <AminoKindTable onNavigate={onNavigate} />
      <Sources list={[DGE_FAQ, cited(leucineFacts), WHO_2007, BLS]} />
    </>
  );
}

function Leucine({ onNavigate }: Nav) {
  const d = useData();
  const profiles = useMemo(() => aminoProfiles(d.foods.foods, ['LEU']), [d.foods]);
  const meal = perMealProtein.value;
  const lf = leucineFacts.value;
  const mine = fmtNumber(meal.gPerKg * weightKg(d));
  return (
    <>
      <p>
        <strong>{t('pq.leu.lead')}</strong>
      </p>
      <p>
        {t('pq.leu.meal', {
          gMin: meal.gMin,
          gMax: meal.gMax,
          gPerKg: fmtNumber(meal.gPerKg, 2),
          mine,
          leuMin: fmtNumber(meal.leucineMinG, 1),
          leuMax: fmtNumber(meal.leucineMaxG, 1),
          hMin: meal.hoursMin,
          hMax: meal.hoursMax,
        })}
      </p>
      <p>{t('pq.leu.threshold', { g: fmtNumber(lf.thresholdG) })}</p>
      <h3>{t('pq.leu.table')}</h3>
      <div className="table-scroll">
        <table className="nutrient-table group-info-table">
          <thead>
            <tr>
              <th scope="col">{t('pq.leu.colKind')}</th>
              <th scope="col" className="num">
                {t('pq.leu.colPer100')}
              </th>
              <th scope="col" className="num">
                {t('pq.leu.colFor', { g: fmtNumber(lf.thresholdG) })}
              </th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const mgPerG = p.mgPerG.LEU;
              return (
                <tr key={p.kind}>
                  <th scope="row">{t(PROTEIN_KIND_KEYS[p.kind])}</th>
                  <td className="num">{mgPerG === undefined ? '–' : `${fmtNumber(mgPerG / 10, 1)} g`}</td>
                  <td className="num">{mgPerG === undefined ? '–' : `${fmtNumber((lf.thresholdG * 1000) / mgPerG)} g`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p>{t('pq.leu.plant', { plant: fmtNumber(lf.plantPer100gProtein, 1), animal: fmtNumber(lf.animalPer100gProtein, 1) })}</p>
      <p className="muted">{t('pq.leu.health')}</p>
      <p>
        <a href={href('nutrient', 'LEU')} onClick={onNavigate}>
          {NUTRIENT_BY_ID.get('LEU')?.name}
        </a>
      </p>
      <Sources list={[cited(perMealProtein), cited(leucineFacts), { label: 'FAO (2013): Dietary protein quality evaluation in human nutrition, section 4.3', url: 'https://www.fao.org/3/i3124e/i3124e.pdf' }, BLS]} />
    </>
  );
}

