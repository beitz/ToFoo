import { useState } from 'react';
import { homeProtocol } from '../../../model/blood-pressure';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatTime } from '../../lib/dates';
import { bpCategory, bpWeek, lastVeryHigh, type BpCategory } from '../../logic/bloodPressure';
import type { BloodPressureReading } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import { BloodPressureSheet } from './BloodPressureSheet';
import { BP_CATEGORY_KEY, bpText } from './format';
import { useDayBloodPressure } from './useBloodPressure';

/** The category as a word in a chip; the colour only repeats what the word says. */
export function BpChip({ category }: { category: BpCategory }) {
  return <span className={`bp-chip bp-cat-${category}`}>{t(BP_CATEGORY_KEY[category])}</span>;
}

/**
 * The newest reading is very high (model/blood-pressure.ts `veryHigh`): measure again after rest,
 * and what to do if it stays. Shown on Home and the page until a newer reading is lower.
 */
export function VeryHighNotice({ readings }: { readings: readonly BloodPressureReading[] }) {
  const r = lastVeryHigh(readings);
  if (!r) return null;
  return (
    <div className="card bp-alert" role="status">
      <p className="small">
        <Icon name="warning" size={16} /> <strong>{t('bp.veryHighHead', { value: bpText(r) })}</strong>
      </p>
      <p className="small">{t('bp.veryHighText', { rest: homeProtocol.value.restMinutes })}</p>
    </div>
  );
}

/**
 * Home (docs/SPEC.md, "Blood pressure"): one line with the average of the last 7 days, the protocol's
 * window, and its category; a tap opens the page, + adds readings.
 */
export function BloodPressureCard() {
  const d = useData();
  const [adding, setAdding] = useState(false);
  const { average, enough } = bpWeek(d.bloodPressure, d.today);
  const sub = !average ? t('bp.homeNone') : enough ? t('bp.homeSub', { n: average.readings }) : t('bp.homeFew', { n: average.readings, days: average.days });
  return (
    <>
      <div className="card water-card bp-card" data-tour="home.bp">
        <a className="water-main" href={href('blood-pressure')} aria-label={`${t('bp.title')}: ${average ? `${bpText(average)} mmHg, ${t(BP_CATEGORY_KEY[bpCategory(average)])}` : t('bp.homeNone')}. ${sub}`}>
          <span className="water-head">
            <span className="water-title">
              <Icon name="heart" size={18} /> {t('bp.title')}
            </span>
            {average && (
              <span className="water-amount bp-amount">
                {bpText(average)} <BpChip category={bpCategory(average)} />
              </span>
            )}
          </span>
          <span className="muted small">{sub}</span>
        </a>
        <button className="btn btn-secondary water-glass" onClick={() => setAdding(true)} aria-label={t('bp.addTitle')}>
          <Icon name="plus" size={18} /> {t('bp.add')}
        </button>
        {adding && <BloodPressureSheet defaultTime={Date.now()} onClose={() => setAdding(false)} />}
      </div>
      <VeryHighNotice readings={d.bloodPressure} />
    </>
  );
}

/** The readings of one day as rows that open for editing; for the diary and the page. */
export function ReadingRows({ readings, onEdit }: { readings: readonly BloodPressureReading[]; onEdit: (r: BloodPressureReading) => void }) {
  return (
    <ul className="plain-list">
      {readings.map((r) => (
        <li key={r.id}>
          <button className="entry-row" onClick={() => onEdit(r)}>
            <span className="entry-label">
              {formatTime(r.time)} · <strong>{bpText(r)}</strong>
              {r.pulse !== undefined && <span className="muted"> · {t('bp.pulseValue', { n: r.pulse })}</span>}
            </span>
            <span className="entry-edit">
              <Icon name="edit" size={16} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** The diary's card for one day: its readings and a button to add some. */
export function DayBloodPressure({ day }: { day: string }) {
  const d = useData();
  const readings = useDayBloodPressure(day);
  const [sheet, setSheet] = useState<BloodPressureReading | 'new' | null>(null);
  return (
    <div className="card">
      <div className="card-head">
        <h2>
          <a href={href('blood-pressure')} className="bp-head-link">
            <Icon name="heart" size={18} /> {t('bp.title')}
          </a>
        </h2>
        <button className="btn btn-small btn-secondary" onClick={() => setSheet('new')}>
          <Icon name="plus" size={16} /> {t('bp.add')}
        </button>
      </div>
      {readings.length ? <ReadingRows readings={readings} onEdit={setSheet} /> : <p className="muted small">{t('bp.dayNone')}</p>}
      {sheet && <BloodPressureSheet record={sheet === 'new' ? undefined : sheet} defaultTime={defaultTimeFor(day, d.today)} onClose={() => setSheet(null)} />}
    </div>
  );
}
