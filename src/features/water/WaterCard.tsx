import { useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { dayWater, waterTarget } from '../../logic/water';
import { Icon } from '../../ui/Icon';
import { defaultTimeFor } from '../log/time';
import type { DrinkContainer } from '../../storage/types';
import { containerAmountText, logContainer, logFinished, sinceForTap } from './containers';
import { waterText } from './format';
import { useWaterDays, useWaterRecords } from './useWater';
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
  const records = useWaterDays();
  const stored = useWaterRecords();
  // The add sheet, open on one container (one logged when empty whose fill time the app must ask).
  const [adding, setAdding] = useState<{ container?: string } | null>(null);
  if (!records || !stored) return null;
  const w = dayWater(day, d.modelEntries, records);
  const target = waterTarget(d.requirements.ageGroup);
  const pct = Math.round((w.totalMl / target) * 100);
  const containers = d.settings.drinkContainers ?? [];

  /** One tap: a full one drunk now, or one logged when empty finished now (since its last finish). */
  function tap(c: DrinkContainer) {
    const time = defaultTimeFor(day, d.today);
    if (!c.whenEmpty) return void logContainer(c, 1, time, d.foods, toast);
    const since = sinceForTap(c, stored ?? [], d.log, time);
    if (since === undefined) setAdding({ container: c.id });
    else void logFinished(c, 1, time, since, d.foods, toast);
  }

  return (
    <div className="card water-card">
      <button className="water-main" onClick={() => setAdding({})} aria-label={`${t('water.title')}: ${t('water.ofTarget', { amount: waterText(w.totalMl), target: waterText(target) })}. ${t('water.addTitle')}`}>
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
            <button key={c.id} className="btn btn-secondary water-glass" onClick={() => tap(c)} aria-label={t(c.whenEmpty ? 'drinks.finishFull' : 'drinks.addFull', { name: c.name, what: containerAmountText(c, 1, d.foods) })}>
              <Icon name={c.whenEmpty ? 'check' : 'plus'} size={18} /> <span className="water-container-name">{c.whenEmpty ? t('drinks.emptyButton', { name: c.name }) : c.name}</span>
            </button>
          ))}
        </div>
      )}
      {adding && <WaterSheet defaultTime={defaultTimeFor(day, d.today)} container={adding.container} onClose={() => setAdding(null)} />}
    </div>
  );
}
