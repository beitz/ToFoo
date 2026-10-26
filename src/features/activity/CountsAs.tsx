import { useState } from 'react';
import { searchCompendium } from '../../activities/compendium';
import { t, type MessageKey } from '../../i18n';
import { fmtNumber } from '../../lib/format';
import { activityEnergyOf, rowOf } from '../../logic/energyBurn';
import { effortOfMet } from '../../model/activityEnergy';
import { Icon } from '../../ui/Icon';
import { fmtKcal10 } from '../weight/format';
import type { ActivityDraft } from './ActivityForm';
import { useBurnBase } from './useBurn';

/**
 * Which Compendium activity this counts as, and the energy it adds (docs/SPEC.md, "Energy burned").
 * The row for the kind and effort is used until the user picks the exact activity from the list;
 * picking sets the effort from its MET value.
 */
export function CountsAs({ draft, onChange }: { draft: ActivityDraft; onChange: (d: ActivityDraft) => void }) {
  const base = useBurnBase();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  if (!base) return null;
  const r = rowOf(draft);
  const e = draft.minutes ? activityEnergyOf({ ...draft, minutes: draft.minutes }, base.weightKg, base.kcalPerDay) : undefined;
  const results = open ? searchCompendium(query) : [];
  const kind = t(`activity.kind.${draft.kind}` as MessageKey);

  return (
    <div className="field counts-as">
      <span className="field-label">{t('activity.countsAs')}</span>
      {r ? (
        <p className="counts-as-row">
          {r.row.description} <span className="muted small">· {t('activity.met', { met: fmtNumber(r.row.met, 1) })}</span>
        </p>
      ) : (
        <p className="muted">{t('activity.countsAsNone')}</p>
      )}
      {e && (
        <p className="small">
          <strong>{t('activity.adds', { kcal: fmtKcal10(e.extraKcal) })}</strong> <span className="muted">· {t('activity.costInAll', { kcal: fmtKcal10(e.totalKcal) })}</span>
        </p>
      )}
      <div className="row counts-as-actions">
        <button type="button" className="btn btn-small btn-secondary" aria-expanded={open}
          onClick={() => {
            // The user's own name for it is the first thing to look for ("Yoga", "Football").
            if (!open) setQuery(draft.name.trim());
            setOpen(!open);
          }}
        >
          <Icon name="search" size={16} /> {t(r?.picked ? 'activity.pickOther' : 'activity.pick')}
        </button>
        {r?.picked && (
          <button type="button" className="btn btn-small btn-ghost" onClick={() => onChange({ ...draft, compendium: undefined })}>
            {draft.kind === 'other' ? t('activity.pickClear') : t('activity.pickUsual', { kind })}
          </button>
        )}
      </div>
      {open && (
        <>
          <div className="search-box">
            <Icon name="search" />
            <input type="search" autoFocus value={query} onChange={(ev) => setQuery(ev.target.value)} placeholder={t('activity.pickSearch')} aria-label={t('activity.pickSearch')} />
          </div>
          {query.trim() && results.length === 0 && <p className="muted small">{t('activity.pickNone')}</p>}
          <ul className="result-list">
            {results.map((a) => (
              <li key={a.code}>
                <button
                  type="button"
                  className={`result${draft.compendium === a.code ? ' on' : ''}`}
                  onClick={() => {
                    onChange({ ...draft, compendium: a.code, intensity: effortOfMet(a.met) });
                    setOpen(false);
                    setQuery('');
                  }}
                >
                  <span className="result-name">{a.description}</span>
                  <span className="muted small">
                    {a.heading} · {t('activity.met', { met: fmtNumber(a.met, 1) })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="muted small">{t('activity.pickSource')}</p>
        </>
      )}
    </div>
  );
}
