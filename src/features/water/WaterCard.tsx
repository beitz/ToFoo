import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { dayWater, waterTarget } from '../../logic/water';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import { containerAmountText, logContainer } from './containers';
import { waterText } from './format';
import { useWater } from './useWater';
import { addWaterWithUndo, WaterSheet } from './WaterSheet';

/** One glass, the quick-add amount. */
const GLASS_ML = 250;

/**
 * Water on one day (docs/SPEC.md, "Water"): plain water plus the water in foods and other drinks,
 * against the DGE guide value, with a one-tap glass (or one tap per own container: a full teapot,
 * a full bottle) and a sheet for other amounts. On Home for
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
  const containers = d.settings.drinkContainers ?? [];

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
      {containers.length === 0 ? (
        <button className="btn btn-secondary water-glass" onClick={() => void addWaterWithUndo(GLASS_ML, defaultTimeFor(day, d.today), toast)} aria-label={t('water.addGlass', { amount: waterText(GLASS_ML) })}>
          <Icon name="plus" size={18} /> {waterText(GLASS_ML)}
        </button>
      ) : (
        // One tap logs a full container; the sheet takes part of one (half a pot).
        <div className="water-containers">
          {containers.map((c) => (
            <button key={c.id} className="btn btn-secondary water-glass" onClick={() => void logContainer(c, 1, defaultTimeFor(day, d.today), d.foods, toast)} aria-label={t('drinks.addFull', { name: c.name, what: containerAmountText(c, 1, d.foods) })}>
              <Icon name="plus" size={18} /> <span className="water-container-name">{c.name}</span>
            </button>
          ))}
        </div>
      )}
      {adding && <WaterSheet defaultTime={defaultTimeFor(day, d.today)} onClose={() => setAdding(false)} />}
    </div>
  );
}
