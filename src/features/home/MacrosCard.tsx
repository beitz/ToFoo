import { useData } from '../../app/data';
import { href, navigate } from '../../app/router';
import { t } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { NUTRIENT_BY_ID } from '../../model/nutrients';
import type { NutrientResult } from '../../model/simulate';
import { hasNoData } from '../../ui/Gauge';
import { Icon } from '../../ui/Icon';
import { statusLabel } from '../../ui/status';
import { StatusMark } from '../../ui/Tile';

/** Room past the target, so the target mark never sits at the very end of the bar. */
const HEADROOM = 1.25;

/**
 * Energy and macronutrients on Home (design 2026-10-22): amounts per day with their unit against the
 * target, so they never read as a percent. Two lines per row (name and amount, then the bar) so the
 * numbers fit on a narrow phone. ◎ = the user's own target.
 */
export function MacrosCard({ results, defaultBased, windowDays }: { results: NutrientResult[]; defaultBased: (id: string) => boolean; windowDays: number }) {
  const d = useData();
  if (results.length === 0) return null;
  const anyDefault = results.some((r) => defaultBased(r.id));
  return (
    <div className="card home-card">
      <div className="card-head">
        <h2>{t('home.macrosTitle')}</h2>
        <span className="card-note">{t('home.macrosNote', { n: windowDays })}</span>
      </div>
      <div className="macro-list">
        {results.map((r) => {
          const def = NUTRIENT_BY_ID.get(r.id);
          const unit = def?.unit ?? '';
          const noData = hasNoData(r);
          const target = r.kind === 'info' ? undefined : r.kind === 'limit' ? r.limit : d.requirements.byNutrient.get(r.id)?.recommended;
          const amount = r.averageIntake;
          const scale = Math.max((target ?? amount) * HEADROOM, amount * 1.02, 1e-9);
          const status = noData ? 'unknown' : r.status;
          const value = noData ? '–' : fmtNumber(amount, def?.decimals && amount < 10 ? 1 : 0);
          const spoken = `${def?.name ?? r.id}: ${noData ? t('gauge.noData') : `${value} ${unit}`}${target ? ` ${t(r.kind === 'limit' ? 'home.ofMaxSpoken' : 'home.ofTargetSpoken', { target: `${fmtNumber(target)} ${unit}` })}` : ''}, ${statusLabel(status)}${r.ownTarget ? `, ${t('gauge.ownTarget')}` : ''}`;
          return (
            <button key={r.id} type="button" className={`macro-item gauge-${status}`} onClick={() => navigate('nutrient', r.id)} aria-label={spoken}>
              <span className="macro-line" aria-hidden>
                <span className="macro-name">
                  {def?.short ?? r.id}
                  {defaultBased(r.id) && <span className="gauge-default">*</span>}
                  {r.ownTarget && <Icon name="target" size={12} />}
                </span>
                {status !== 'fine' && status !== 'info' && <StatusMark status={status} size={11} />}
                <span className="macro-value">
                  <strong>{value}</strong>
                  {target !== undefined && (
                    <span className="macro-target">
                      {' '}
                      / {fmtNumber(target)}
                      {r.kind === 'limit' ? ` ${t('home.maxShort')}` : ''}
                    </span>
                  )}{' '}
                  <span className="macro-unit">{unit}</span>
                </span>
              </span>
              <span className="macro-bar" aria-hidden>
                {!noData && <span className="macro-fill" style={{ width: `${Math.min(1, amount / scale) * 100}%` }} />}
                {target !== undefined && <span className="macro-tick" style={{ left: `${(target / scale) * 100}%` }} />}
              </span>
            </button>
          );
        })}
      </div>
      {anyDefault && (
        <p className="muted small">
          * {t('home.defaultsNote')} <a href={href('settings', 'profile')}>{t('home.addProfile')}</a>
        </p>
      )}
    </div>
  );
}
