import { useData } from '../../app/data';
import { navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { fmtAmount, fmtPercent } from '../../lib/format';
import { trendDisplay } from '../../../model/parameters';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import { isUnsure, type GaugeStatus, type NutrientResult } from '../../model/simulate';
import { trendOf } from '../../model/trend';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { hasNoData, trendArrows, trendLabel, windowTag } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { statusText } from '../../ui/status';
import { StatusMark } from '../../ui/Tile';
import { GroupInfoButton, hasGroupInfo } from '../info/GroupInfo';
import { byUrgency, groupNutrients } from './grouping';

/** Key in settings.homeCollapsed: the list is closed unless the user opened it. */
const OPEN_KEY = 'needs:all';
/** The comet track runs to 150 % so the need (100 %) sits two thirds along, with room past it. */
const TRACK_MAX = 1.5;
const COUNT_ORDER: GaugeStatus[] = ['low', 'gettingLow', 'tooHigh', 'fine', 'unknown'];

const statusOf = (r: NutrientResult): GaugeStatus => (hasNoData(r) ? 'unknown' : r.status);
const at = (v: number) => `${(Math.max(0, Math.min(TRACK_MAX, v)) / TRACK_MAX) * 100}%`;

/**
 * The nutrients in Home's "Last 7 days" card (owner's ask, 2026-10-22): one line of small squares,
 * one per nutrient, with how many have each status; tap to open the comet list from the design (one
 * line per nutrient with its full name, a dot where the average is and a tail from where it was a
 * week ago), sorted by what matters most or by type. The tile view (NutrientTile) is parked for later.
 */
export function NutrientsSection({ results, showRange }: { results: NutrientResult[]; showRange: boolean }) {
  const d = useData();
  const open = d.settings.homeCollapsed?.[OPEN_KEY] === true;
  const toggle = () => void repo.updateSettings({ homeCollapsed: { ...d.settings.homeCollapsed, [OPEN_KEY]: !open } });
  const sorted = [...results].sort(byUrgency);
  const counts = COUNT_ORDER.map((s) => ({ s, n: results.filter((r) => statusOf(r) === s).length })).filter((c) => c.n > 0);
  if (results.length === 0) return null;

  return (
    <section className="home-sub" aria-label={t('home.nutrients')}>
      <button type="button" className="needs-summary" aria-expanded={open} onClick={toggle}>
        <span className="needs-squares" aria-hidden>
          {sorted.map((r) => (
            <span key={r.id} className={`sq sq-${statusOf(r)}`} />
          ))}
        </span>
        <span className="needs-foot">
          <span className="needs-counts" aria-hidden>
            {counts.map(({ s, n }) => (
              <span key={s}>
                <StatusMark status={s} size={11} />
                <strong>{n}</strong>
              </span>
            ))}
          </span>
          <span className="visually-hidden">{counts.map(({ s, n }) => `${n} ${t(`statusWord.${s}` as MessageKey)}`).join(', ')}. </span>
          <span className="needs-more">{open ? t('home.showFewer') : t('home.showAll')}</span>
          <span className={open ? 'chev chev-up' : 'chev'} aria-hidden>
            <Icon name="chevron" size={18} />
          </span>
        </span>
      </button>
      {open && <CometView results={results} showRange={showRange} />}
    </section>
  );
}

/**
 * The comet list with its sort switch, "Most important" or "By type" (remembered in settings.homeGrouping).
 * Used on Home and on the nutrients page when Settings → Appearance → Nutrients is "Comets".
 */
export function CometView({ results, showRange, open }: { results: NutrientResult[]; showRange: boolean; open?: (id: string) => void }) {
  const d = useData();
  const byType = d.settings.homeGrouping === 'type';
  return (
    <>
      <Segmented
        className="comet-sort"
        label={t('home.sortLabel')}
        value={byType ? 'type' : 'status'}
        options={[
          { value: 'status', label: t('home.sortImportant') },
          { value: 'type', label: t('home.sortType') },
        ]}
        onChange={(v) => void repo.updateSettings({ homeGrouping: v })}
      />
      {byType ? (
        groupNutrients(results, 'type').map((g) => (
          <div key={g.key} className="comet-group">
            <div className="tile-group-head">
              <h4>{t(`home.group.type.${g.id}` as MessageKey)}</h4>
              {hasGroupInfo(g.id) && <GroupInfoButton group={g.id} />}
            </div>
            <CometList items={g.items} showRange={showRange} open={open} />
          </div>
        ))
      ) : (
        <CometList items={[...results].sort(byUrgency)} showRange={showRange} open={open} />
      )}
    </>
  );
}

function CometList({ items, showRange, open }: { items: NutrientResult[]; showRange: boolean; open?: (id: string) => void }) {
  return (
    <ul className="comet-list">
      {items.map((r) => (
        <li key={r.id}>
          <CometRow result={r} showRange={showRange} open={open} />
        </li>
      ))}
    </ul>
  );
}

/**
 * One nutrient as a comet: the track runs 0–150 % with a tick at 100 % (striped past it for an upper
 * limit), the head is the status mark at the current average and the tail fades back to where the
 * average was a week ago at the current rate. Unknown: a dashed track and no head.
 */
function CometRow({ result: r, showRange, open = (id) => navigate('nutrient', id) }: { result: NutrientResult; showRange: boolean; open?: (id: string) => void }) {
  const def = NUTRIENT_BY_ID.get(r.id);
  const tag = windowTag(r, useData().settings.shortWindowDays);
  // No need or limit to measure against (e.g. sugars): the amount per day only, no track.
  if (r.kind === 'info') {
    const amount = hasNoData(r) ? '–' : `${fmtAmount(r.id, r.averageIntake)}/${t('review.dayShort')}`;
    return (
      <button type="button" className="comet comet-info" onClick={() => open(r.id)} aria-label={`${def?.name ?? r.id}: ${amount}`}>
        <span className="comet-name" aria-hidden>
          {def?.name ?? r.id}
        </span>
        <span className="comet-track" aria-hidden />
        <span className="comet-value" aria-hidden>
          {amount}
        </span>
      </button>
    );
  }
  const status = statusOf(r);
  const noData = status === 'unknown';
  const now = r.value.central;
  const tr = noData ? null : trendOf(r);
  const was = tr && tr.direction !== 'steady' ? now - tr.perDay * trendDisplay.lookbackDays.value : now;
  const [from, to] = was < now ? [was, now] : [now, was];
  const pct = fmtPercent(now);
  const spoken = noData
    ? t('tile.unknownSpoken', { name: def?.name ?? r.id })
    : t(r.kind === 'limit' ? 'tile.limitSpoken' : 'tile.needSpoken', { name: def?.name ?? r.id, pct, status: isUnsure(r.statusSpan) ? statusText(status, r.statusSpan).toLowerCase() : t(`statusWord.${status}` as MessageKey) }) +
      (tr ? `, ${trendLabel(tr)}` : '') +
      (r.ownTarget ? `, ${t('gauge.ownTarget')}` : '') +
      (tag ? `, ${tag.spoken}` : '');
  return (
    <button type="button" className={`comet comet-${r.kind} comet-${status}`} onClick={() => open(r.id)} aria-label={spoken}>
      <span className="comet-name" aria-hidden>
        {def?.name ?? r.id}
        {r.ownTarget && <Icon name="target" size={11} />}
        {tag && <span className="gauge-window">{tag.short}</span>}
      </span>
      <span className="comet-track" aria-hidden>
        <span className="comet-line" />
        {r.kind === 'limit' && <span className="comet-over" style={{ left: at(1) }} />}
        <span className="comet-need" style={{ left: at(1) }} />
        {!noData && (
          <>
            {showRange && r.value.high > r.value.low && <span className="comet-band" style={{ left: at(r.value.low), width: `calc(${at(r.value.high)} - ${at(r.value.low)})` }} />}
            {to > from && <span className={was < now ? 'comet-tail' : 'comet-tail comet-tail-back'} style={{ left: at(from), width: `calc(${at(to)} - ${at(from)})` }} />}
            <span className="comet-head" style={{ left: at(now) }}>
              <StatusMark status={status} size={12} unsure={isUnsure(r.statusSpan)} />
            </span>
          </>
        )}
      </span>
      <span className="comet-value" aria-hidden>
        {noData ? '?' : `${now >= 10 ? '>999%' : pct.replace(/\s/g, '')}`}
        {tr && <span className="comet-arrow">{trendArrows(tr)}</span>}
      </span>
    </button>
  );
}
