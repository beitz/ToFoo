import { navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtFill } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { NutrientResult, StoreResult } from '../../model/simulate';
import { storeTrendOf } from '../../model/trend';
import { storeNeedsAttention } from '../../logic/stores';
import { fmtDuration } from '../../ui/duration';
import { fmtDurationShort, storeLastsDays, storeTrendLabel, trendArrows } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { statusLabel } from '../../ui/status';
import { StatusMark, symbolOf } from '../../ui/Tile';

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * The six body stores on Home (design 2026-10-22), in the Stores card when nutrients show as comets: a blue tank
 * each, used for stores only, with its status mark, % full, the filling / draining arrow and how long
 * it would last with none.
 */
export function StoresSection({ stores, showRange }: { stores: Array<NutrientResult & { store: StoreResult }>; showRange: boolean }) {
  if (stores.length === 0) return null;
  return (
    <div className="store-row" role="group" aria-label={t('home.stores')}>
      {stores.map((r) => (
        <StoreTank key={r.id} result={r} showRange={showRange} />
      ))}
    </div>
  );
}

function StoreTank({ result: r, showRange }: { result: NutrientResult & { store: StoreResult }; showRange: boolean }) {
  const st = r.store;
  const def = NUTRIENT_BY_ID.get(r.id);
  const low = clamp01(showRange ? st.fill.low : st.fill.central);
  const high = clamp01(showRange ? st.fill.high : st.fill.central);
  const mid = clamp01(st.fill.central);
  const tr = storeTrendOf(st);
  const days = storeLastsDays(st);
  const lasts = days === null ? '' : days <= 0 ? t('tank.empty') : days < 1 ? t('durationShort.underDay') : fmtDurationShort(days);
  const warn = storeNeedsAttention(st);
  const spoken = [
    `${def?.name ?? r.id}: ${t('gauge.full', { pct: fmtFill(st.fill.central) })}`,
    statusLabel(st.status),
    tr ? storeTrendLabel(tr) : '',
    days === null ? '' : days <= 0 ? t('tank.empty') : t('tank.lasts', { time: days < 1 ? t('duration.underDay') : fmtDuration(days) }),
    warn ? t('store.warnSpoken') : '',
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <button type="button" className={`store-col gauge-${st.status}`} onClick={() => navigate('nutrient', r.id)} aria-label={spoken}>
      <span className="store-mark" aria-hidden>
        {warn ? <Icon name="warning" size={13} /> : <StatusMark status={st.status} size={12} />}
      </span>
      <span className="store-tank" aria-hidden>
        <span className="store-band" style={{ bottom: `${low * 100}%`, height: `${(high - low) * 100}%` }} />
        <span className="store-fill" style={{ height: `${low * 100}%` }} />
        <span className="store-level" style={{ bottom: `calc(${mid * 100}% - 1px)` }} />
      </span>
      <span className="store-name" aria-hidden>
        {symbolOf(r.id)}
      </span>
      <span className="store-pct" aria-hidden>
        {fmtFill(st.fill.central)}
      </span>
      <span className="store-lasts" aria-hidden>
        {tr ? trendArrows(tr) : ''} {lasts}
      </span>
    </button>
  );
}
