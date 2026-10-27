import { useMemo, useState } from 'react';
import { useData, type AppData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { cameFrom, timesEaten } from '../../logic/nutrientPage';
import type { NutrientResult } from '../../model/simulate';
import type { LogEntry } from '../../storage/types';
import { refHref } from '../food/links';

/**
 * "Where it came from" (design 2026-10-22): what gave the amount taken up in the window, as a bar
 * and a list of the biggest sources and the rest. "Per time eaten" divides by how often each was
 * eaten (×4), so a big plate eaten once shows next to something small eaten every day.
 */
export function CameFromCard({ r, days }: { r: NutrientResult; days?: readonly string[] }) {
  const d = useData();
  const [perTime, setPerTime] = useState(false);
  // The model's window, or the days of a past period (`days`, the ones its averages count).
  const windowDays = useMemo(() => new Set(days ?? d.modelDays.slice(-r.windowDays)), [days, d.modelDays, r.windowDays]);
  const times = useMemo(() => timesEaten(d.log, windowDays), [d.log, windowDays]);
  if (r.contributors.length === 0) return null;
  const n = days ? days.length : r.windowDays;
  const { total, lines, rest } = cameFrom(r.contributors, n, times, perTime);
  const all = rest ? [...lines, rest] : lines;
  return (
    <div className="card came-from" data-tour="nutrient.sources">
      <div className="card-head">
        <h2>{t('came.title')}</h2>
        <span className="card-note">
          {n === 1 ? t('came.noteOne', { amount: fmtAmount(r.id, total) }) : t('came.note', { days: n, amount: fmtAmount(r.id, total) })}
        </span>
      </div>
      <div className="segmented" role="group" aria-label={t('came.viewLabel')}>
        <button type="button" className={perTime ? '' : 'on'} aria-pressed={!perTime} onClick={() => setPerTime(false)}>
          {t('came.total')}
        </button>
        <button type="button" className={perTime ? 'on' : ''} aria-pressed={perTime} onClick={() => setPerTime(true)}>
          {t('came.perTime')}
        </button>
      </div>
      <div className="came-bar" aria-hidden>
        {all.map((l, i) => (
          <span key={l.label || 'rest'} className={`came-seg came-seg-${Math.min(i, 4)}`} style={{ flex: l.share }} />
        ))}
      </div>
      <ul className="plain-list came-list">
        {all.map((l, i) => {
          const to = l.label ? contributorHref(d, l.label) : undefined;
          const amount = perTime && !l.label ? '' : fmtAmount(r.id, l.amount);
          const body = (
            <>
              <span className={`came-dot came-seg-${Math.min(i, 4)}`} aria-hidden />
              <span className="grow">
                {l.label || t('came.rest')}
                {perTime && l.times > 0 && <span className="muted small"> ×{l.times}</span>}
              </span>
              <span className="muted small">{amount}</span>
              <strong className="came-pct">{fmtPercent(l.share)}</strong>
            </>
          );
          return (
            <li key={l.label || 'rest'}>
              {to ? (
                <a className="came-line" href={to}>
                  {body}
                </a>
              ) : (
                <div className="came-line">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {perTime && <p className="small muted">{t('came.perTimeNote')}</p>}
    </div>
  );
}

/**
 * Where a "Where it came from" line leads: contributors are summed by name, so the latest entry of
 * that name says what it is: a recipe portion its recipe, a food its page, anything else that entry.
 */
export function contributorHref(d: AppData, label: string): string | undefined {
  let latest: LogEntry | undefined;
  for (const e of d.log) if (e.label === label && (!latest || e.time > latest.time)) latest = e;
  if (!latest) return undefined;
  if (latest.kind === 'portion') {
    const recipeId = d.batchesById.get(latest.batchId)?.recipeId;
    if (recipeId && d.recipes.some((x) => x.id === recipeId)) return href('recipes', recipeId);
  }
  if (latest.kind === 'food') return refHref(d, latest.ref) ?? href('entry', latest.id);
  return href('entry', latest.id);
}
