import { useMemo } from 'react';
import { compendiumActivity } from '../../activities/compendium';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { t, type MessageKey } from '../../i18n';
import { newId } from '../../lib/id';
import { activityKey } from '../../logic/activity';
import { frequentActivities } from '../../logic/catchUp';
import { repo } from '../../storage/repo';
import type { FavouriteActivity } from '../../storage/types';
import { Icon } from '../../ui/Icon';
import { LogSection } from '../log/LogSection';
import { DEFAULT_ACTIVITY_SKIN, type ActivityDraft } from './ActivityForm';

/** How far back Recent counts, and how many it shows. */
const RECENT_WEEKS = 4;
const RECENT_SHOWN = 5;

type Pick = Omit<FavouriteActivity, 'id'>;

/** The sheet's fields for a pick: everything but when. */
export function patchOf(p: Pick): Partial<ActivityDraft> {
  return {
    kind: p.kind,
    name: p.name ?? '',
    minutes: p.minutes,
    intensity: p.intensity ?? 'moderate',
    compendium: p.compendium,
    outside: p.outside,
    sun: !!p.sunSkin,
    skin: p.sunSkin ?? DEFAULT_ACTIVITY_SKIN,
  };
}

/** Own name, else the picked Compendium row for "Other" (it says more than "Other"), else the kind. */
function pickName(p: Pick): string {
  return p.name?.trim() || (p.kind === 'other' ? compendiumActivity(p.compendium)?.description : undefined) || t(`activity.kind.${p.kind}` as MessageKey);
}

function pickDetail(p: Pick): string {
  const parts = [t('activity.summary', { min: p.minutes }), t(`activity.intensity.${p.intensity ?? 'moderate'}` as MessageKey)];
  if (p.outside) parts.push(t('activity.outsideMark'));
  return parts.join(' · ');
}

/**
 * Favourites and Recent at the top of the activity sheet (owner's ask, 2026-10-26: the same activity
 * logged again and again): one tap fills in what, minutes, effort, Compendium row and outside, and
 * keeps the time. Recent is what was logged most often in the last four weeks; ☆ pins one.
 */
export function ActivityPicks({ draft, onPick }: { draft: ActivityDraft; onPick: (patch: Partial<ActivityDraft>) => void }) {
  const d = useData();
  const toast = useToast();
  const favourites = d.settings.favouriteActivities ?? [];
  const recent = useMemo(() => {
    const pinned = new Set(favourites.map(activityKey));
    return frequentActivities(d.activities, d.today, Infinity, { days: RECENT_WEEKS * 7, withDay: true })
      .filter((p) => !pinned.has(activityKey(p)))
      .slice(0, RECENT_SHOWN);
  }, [d.activities, d.today, favourites]);
  if (!favourites.length && !recent.length) return null;

  const key = activityKey(draft);
  const isPicked = (p: Pick) => activityKey(p) === key && p.minutes === draft.minutes && (p.intensity ?? 'moderate') === draft.intensity;

  function pin(p: Pick) {
    const fav: FavouriteActivity = {
      id: newId(),
      kind: p.kind,
      ...(p.name ? { name: p.name } : {}),
      minutes: p.minutes,
      ...(p.intensity ? { intensity: p.intensity } : {}),
      ...(p.compendium ? { compendium: p.compendium } : {}),
      outside: p.outside,
      ...(p.sunSkin ? { sunSkin: p.sunSkin } : {}),
    };
    void repo.addFavouriteActivity(fav);
  }
  function unpin(fav: FavouriteActivity) {
    const index = favourites.findIndex((f) => f.id === fav.id);
    void repo.removeFavouriteActivity(fav.id);
    toast(t('fav.removed', { name: pickName(fav) }), () => repo.addFavouriteActivity(fav, index));
  }

  const row = (p: Pick, rowKey: string, star: { on: boolean; toggle: () => void }, detail: string) => {
    const name = pickName(p);
    const on = isPicked(p);
    return (
      <li key={rowKey} className="fav-row">
        <button type="button" className={on ? 'result on' : 'result'} aria-pressed={on} onClick={() => onPick(patchOf(p))}>
          <span className="result-name">{name}</span>
          <span className="muted small">{detail}</span>
        </button>
        <button type="button" className={`icon-btn fav-star${star.on ? ' on' : ''}`} aria-pressed={star.on} aria-label={t(star.on ? 'fav.unpin' : 'fav.pin', { name })} onClick={star.toggle}>
          <Icon name="star" filled={star.on} />
        </button>
      </li>
    );
  };

  return (
    <LogSection id="activityPicks" title={t('activity.picks')} count={favourites.length + recent.length} icon={<Icon name="star" size={16} filled />}>
      <ul className="result-list activity-picks">
        {favourites.map((f) => row(f, f.id, { on: true, toggle: () => unpin(f) }, pickDetail(f)))}
        {recent.map((p) => row(p, activityKey(p), { on: false, toggle: () => pin(p) }, t('activity.picksRecent', { detail: pickDetail(p), n: p.count, weeks: RECENT_WEEKS })))}
      </ul>
    </LogSection>
  );
}
