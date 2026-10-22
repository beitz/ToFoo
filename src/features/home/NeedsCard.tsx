import { useState } from 'react';
import { useData } from '../../app/data';
import { navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import type { GaugeStatus, NutrientResult } from '../../model/simulate';
import { repo } from '../../storage/repo';
import { hasNoData } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { NutrientTile, StatusMark } from '../../ui/Tile';
import { GroupInfoButton, hasGroupInfo } from '../info/GroupInfo';
import { byUrgency, groupNutrients } from './grouping';

/** How many nutrients "Needs you" shows before the full breakdown (owner's pick: seven). */
const NEEDS_SHOWN = 7;
const ATTENTION: readonly GaugeStatus[] = ['low', 'gettingLow', 'tooHigh'];
/** Key in settings.homeCollapsed: the full breakdown is closed unless the user opened it. */
const OPEN_KEY = 'needs:all';

const statusOf = (r: NutrientResult): GaugeStatus => (hasNoData(r) ? 'unknown' : r.status);

/**
 * "Needs you" on Home (design 2026-10-22): the nutrients that need attention most, as tiles, a row
 * of small squares for every nutrient, and the full breakdown by type in place on tap. Shares are
 * averages over the window, as before; limits are striped.
 */
export function NeedsCard({ results, showRange, windowDays }: { results: NutrientResult[]; showRange: boolean; windowDays: number }) {
  const d = useData();
  const open = d.settings.homeCollapsed?.[OPEN_KEY] === true;
  const [legend, setLegend] = useState(false);
  const toggle = () => void repo.updateSettings({ homeCollapsed: { ...d.settings.homeCollapsed, [OPEN_KEY]: !open } });
  const sorted = [...results].sort(byUrgency);
  const needs = sorted.filter((r) => ATTENTION.includes(statusOf(r))).slice(0, NEEDS_SHOWN);
  const enough = results.filter((r) => statusOf(r) === 'fine').length;
  const unknown = results.filter((r) => statusOf(r) === 'unknown').length;
  const go = (id: string) => () => navigate('nutrient', id);

  return (
    <div className="card home-card">
      <div className="card-head">
        <h2>{open ? t('home.allNutrients') : t('home.needsYou')}</h2>
        <button className="card-note card-note-btn" aria-expanded={legend} aria-controls="needs-legend" onClick={() => setLegend((o) => !o)}>
          {t('home.needsNote', { n: windowDays })} <Icon name="info" size={14} />
        </button>
      </div>
      {legend && (
        <p className="muted small" id="needs-legend">
          {t('home.legend')}
        </p>
      )}
      {!open &&
        (needs.length > 0 ? (
          <div className="tile-grid" role="group" aria-label={t('home.needsYou')}>
            {needs.map((r) => (
              <NutrientTile key={r.id} result={r} showRange={showRange} onClick={go(r.id)} />
            ))}
          </div>
        ) : (
          <p className="muted small">{t('home.allEnough')}</p>
        ))}
      {open &&
        groupNutrients(results, 'type').map((g) => (
          <div key={g.key} className="tile-group">
            <div className="tile-group-head">
              <h3>{t(`home.group.type.${g.id}` as MessageKey)}</h3>
              {hasGroupInfo(g.id) && <GroupInfoButton group={g.id} />}
            </div>
            <div className="tile-grid">
              {g.items.map((r) => (
                <NutrientTile key={r.id} result={r} showRange={showRange} onClick={go(r.id)} />
              ))}
            </div>
          </div>
        ))}
      <button type="button" className="needs-summary" aria-expanded={open} onClick={toggle}>
        <span className="needs-squares" aria-hidden>
          {sorted.map((r) => (
            <span key={r.id} className={`sq sq-${statusOf(r)}`} />
          ))}
        </span>
        <span className="needs-counts">
          <span>
            <strong>{enough}</strong> {t('home.enoughWord')}
          </span>
          {unknown > 0 && (
            <span>
              <strong>{unknown}</strong> {t('home.unknownWord')}
            </span>
          )}
        </span>
        <span className="visually-hidden">{open ? t('home.showFewer') : t('home.showAll')}</span>
        <span className={open ? 'chev chev-up' : 'chev'} aria-hidden>
          <Icon name="chevron" size={18} />
        </span>
      </button>
    </div>
  );
}

/** Counts per status across everything Home shows, for the chips under the day strip. */
export function StatusChips({ statuses }: { statuses: GaugeStatus[] }) {
  const order: GaugeStatus[] = ['low', 'gettingLow', 'tooHigh', 'fine', 'unknown'];
  const counts = order.map((s) => ({ s, n: statuses.filter((x) => x === s).length })).filter((c) => c.n > 0);
  return (
    <div className="status-chips" role="list" aria-label={t('home.statusCounts')}>
      {counts.map(({ s, n }) => (
        <span key={s} role="listitem" className={`status-chip status-chip-${s}`}>
          <StatusMark status={s} size={11} />
          <strong>{n}</strong> {t(`statusWord.${s}` as MessageKey)}
        </span>
      ))}
    </div>
  );
}
