import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { dayWater, waterTarget } from '../../logic/water';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import { waterText } from './format';
import { useWater } from './useWater';
import { addWaterWithUndo, WaterSheet } from './WaterSheet';

/** One glass, the quick-add amount. */
const GLASS_ML = 250;

/**
 * Water on one day (docs/SPEC.md, "Water"): plain water plus the water in foods and other drinks,
 * against the DGE guide value, with a one-tap glass and a sheet for other amounts. On Home for
 * today (compact: without the split into plain water and food); in the diary for any day.
 */
export function WaterCard({ day, compact = false }: { day: string; compact?: boolean }) {
  const d = useData();
  const toast = useToast();
  const records = useWater(day);
  const [adding, setAdding] = useState(false);
  if (!records) return null;
  const w = dayWater(day, d.modelEntries, records);
  const target = waterTarget(d.requirements.ageGroup);
  const pct = Math.round((w.totalMl / target) * 100);

  return (
    <div className="card water-card">
      <button className="water-main" onClick={() => setAdding(true)} aria-label={`${t('water.title')}: ${t('water.ofTarget', { amount: waterText(w.totalMl), target: waterText(target) })}. ${t('water.addTitle')}`}>
        <span className="water-head">
          <span className="water-title">
            <Icon name="drop" size={18} /> {t('water.title')}
          </span>
          <span className="water-amount">
            {w.unknown > 0 && '≥ '}
            {t('water.ofTarget', { amount: waterText(w.totalMl), target: waterText(target) })} · {fmtNumber(pct)} %
          </span>
        </span>
        <span className="water-bar" aria-hidden>
          <span className="water-fill" style={{ width: `${Math.min(pct, 100)}%` }} />
        </span>
        {!compact && (
          <span className="muted small">
            {t('water.split', { plain: waterText(w.plainMl), food: waterText(w.foodMl) })}
            {w.unknown > 0 && ` · ${t('water.unknown', { n: w.unknown })}`}
          </span>
        )}
      </button>
      <button className="btn btn-secondary water-glass" onClick={() => void addWaterWithUndo(GLASS_ML, defaultTimeFor(day, d.today), toast)} aria-label={t('water.addGlass', { amount: waterText(GLASS_ML) })}>
        <Icon name="plus" size={18} /> {waterText(GLASS_ML)}
      </button>
      {adding && <WaterSheet defaultTime={defaultTimeFor(day, d.today)} onClose={() => setAdding(false)} />}
    </div>
  );
}
