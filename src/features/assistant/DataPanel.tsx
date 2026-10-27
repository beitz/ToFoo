import { Fragment } from 'react';
import type { SharedData } from '../../ai/assistant';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { addDays, formatDay } from '../../lib/dates';
import { overview, type InsightData, type ShareKind } from '../../logic/insights';
import { HOME_PLACES, type HomePlace } from '../../storage/types';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { placeName } from '../pantry/usePantry';

export type Period = '2w' | '4w' | '3m' | 'all';
const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { '2w': 14, '4w': 28, '3m': 91 };
const PERIOD_LABEL = { '2w': 'insights.p2w', '4w': 'insights.p4w', '3m': 'insights.p3m', all: 'insights.pAll' } as const;
/** Below this, the panel says plainly that there is little to go on (a few weeks, per docs/SPEC.md). */
const THIN_FOOD_DAYS = 14;
const THIN_JOURNAL_ENTRIES = 5;

/** What the user has ticked to include, before anything is sent. */
export interface DataChoice {
  open: boolean;
  period: Period;
  kinds: ShareKind[];
  privateJournal: boolean;
  /** The places at home ticked under Kitchen. */
  kitchen: HomePlace[];
  /** The Kitchen box is open to its places. */
  kitchenOpen: boolean;
}

/** The first day of the chosen period (all: the first day there is data for). */
export function periodStart(data: InsightData | undefined, period: Period, today: string): string {
  if (!data) return today;
  const start = period === 'all' ? data.first : addDays(today, -(PERIOD_DAYS[period] - 1));
  // Never before the first day there is data for, so the line on what is shared names a real day.
  return start > data.first ? start : data.first;
}

/** The kinds as named in a line ("food log, journal with private entries, kitchen (fridge, cupboard)"). */
export function kindNames(kinds: readonly ShareKind[], privateJournal: boolean, kitchen: readonly HomePlace[] = []): string {
  const names = kinds.map((k) => (k === 'journal' && privateJournal ? t('insights.kind.journalPrivate') : t(`insights.kind.${k}`)));
  if (kitchen.length === HOME_PLACES.length) names.push(t('data.kitchenName'));
  else if (kitchen.length) names.push(t('data.kitchenSome', { places: kitchen.map((p) => placeName(p).toLocaleLowerCase('en-GB')).join(', ') }));
  return names.join(', ');
}

/**
 * "Include my data" under the assistant's chat (docs/SPEC.md, "Insights"): closed and unticked
 * from Home, open and ticked when the chat comes from Look for patterns. Once a message went with
 * data, the choice is fixed for the chat and shown as one line.
 */
export function DataPanel({
  choice,
  onChoice,
  data,
  kinds,
  kitchen,
  shared,
  onLook,
  canLook,
  onNew,
}: {
  choice: DataChoice;
  onChoice: (update: (c: DataChoice) => DataChoice) => void;
  data: InsightData | undefined;
  /** The kinds there are to send (the food log and each tracker that is on). */
  kinds: ShareKind[];
  /** With At home on: how many things there are in each place (not used up). */
  kitchen?: Readonly<Record<HomePlace, number>>;
  /** What this chat already sent: the choice is fixed. */
  shared?: SharedData;
  onLook: () => void;
  canLook: boolean;
  onNew: () => void;
}) {
  const d = useData();
  if (shared) {
    return (
      <p className="composer-note data-shared small" role="status">
        <Icon name="lock" size={16} />
        <span className="grow">{t(shared.kinds.length ? 'data.shared' : 'data.sharedKitchen', { from: formatDay(shared.from, d.today), kinds: kindNames(shared.kinds, shared.privateJournal, shared.kitchen) })}</span>
        <button type="button" className="btn btn-small btn-ghost" onClick={onNew}>
          {t('data.newChat')}
        </button>
      </p>
    );
  }

  const toggleOpen = () => onChoice((c) => ({ ...c, open: !c.open }));
  const any = choice.kinds.length + choice.kitchen.length > 0;
  const names = kindNames(choice.kinds, choice.privateJournal, choice.kitchen);
  const label = choice.kinds.length ? t('data.chipOn', { kinds: names, period: t(PERIOD_LABEL[choice.period]) }) : any ? t('data.chipKitchen', { kinds: names }) : t('data.chip');
  const chip = (
    <button type="button" className={`data-chip${any ? ' data-chip-on' : ''}`} aria-expanded={choice.open} onClick={toggleOpen} data-tour="assistant.data">
      <Icon name={any ? 'check' : 'plus'} size={16} />
      <span className="grow">{label}</span>
      <span className={choice.open ? 'data-chip-turn-up' : 'data-chip-turn'} aria-hidden="true">
        <Icon name="chevron" size={16} />
      </span>
    </button>
  );
  if (!choice.open) return <div className="composer-note">{chip}</div>;

  const from = periodStart(data, choice.period, d.today);
  const ov = data ? overview(data, from, d.today) : undefined;
  const ticked = (k: ShareKind) => choice.kinds.includes(k);
  const toggle = (k: ShareKind, on: boolean) => onChoice((c) => ({ ...c, kinds: on ? kinds.filter((x) => x === k || c.kinds.includes(x)) : c.kinds.filter((x) => x !== k) }));
  const thin = ov && ((ticked('food') && ov.foodComplete < THIN_FOOD_DAYS) || (ticked('journal') && ov.journalEntries - (choice.privateJournal ? 0 : ov.privateJournalEntries) < THIN_JOURNAL_ENTRIES));
  const count: Record<ShareKind, string> = ov
    ? {
        food: t('insights.ovFood', { n: ov.foodComplete, days: ov.days }),
        journal: t('insights.ovJournal', { n: ov.journalEntries - ov.privateJournalEntries }),
        sleep: t('insights.ovNights', { n: ov.nights }),
        activity: t('insights.ovActivity', { n: ov.activityDays }),
        water: t('insights.ovWater', { n: ov.waterDays }),
        habits: t('insights.ovHabits', { n: ov.habitDays }),
      }
    : { food: '', journal: '', sleep: '', activity: '', water: '', habits: '' };

  return (
    <div className="composer-note data-panel">
      {chip}
      <div className="data-panel-body">
        <Segmented<Period>
          label={t('insights.period')}
          value={choice.period}
          onChange={(period) => onChoice((c) => ({ ...c, period }))}
          options={(['2w', '4w', '3m', 'all'] as const).map((value) => ({ value, label: t(PERIOD_LABEL[value]) }))}
        />
        {ov ? (
          <>
            <p className="small">
              <strong>{t('insights.ovRange', { from: formatDay(ov.from, d.today), to: formatDay(ov.to, d.today) })}</strong>
            </p>
            <fieldset className="insights-share">
              <legend className="visually-hidden">{t('insights.shareLabel')}</legend>
              {kinds.map((k) => (
                <Fragment key={k}>
                  <label className="radio-row small">
                    <input type="checkbox" checked={ticked(k)} onChange={(e) => toggle(k, e.target.checked)} /> {count[k]}
                  </label>
                  {/* Private entries only go when ticked here, for this chat (owner's ask, 2026-10-24). */}
                  {k === 'journal' && ticked('journal') && ov.privateJournalEntries > 0 && (
                    <label className="radio-row small insights-share-sub">
                      <input type="checkbox" checked={choice.privateJournal} onChange={(e) => onChoice((c) => ({ ...c, privateJournal: e.target.checked }))} /> <Icon name="lock" size={16} />
                      <span>{t(ov.privateJournalEntries === 1 ? 'insights.ovPrivateOne' : 'insights.ovPrivate', { n: ov.privateJournalEntries })}</span>
                    </label>
                  )}
                </Fragment>
              ))}
              {kitchen && <KitchenTicks choice={choice} onChoice={onChoice} counts={kitchen} />}
            </fieldset>
            {thin && <p className="muted small">{t('insights.thin')}</p>}
          </>
        ) : (
          <p className="muted small">{t('common.loading')}</p>
        )}
      </div>
      <p className="muted small data-panel-note">
        {t(any ? 'data.sendNote' : 'data.noneNote')} <a href={href('about', 'sent')}>{t('sent.more')}</a>
      </p>
      <button type="button" className="btn btn-primary" disabled={!canLook || !choice.kinds.length} onClick={onLook}>
        <Icon name="insights" size={18} /> {t('insights.open')}
      </button>
    </div>
  );
}

/**
 * Kitchen: one box for every place at home (ticked when all are, half when some are), opening to
 * a box per place (owner's ask, 2026-10-27: to leave out the spices).
 */
function KitchenTicks({ choice, onChoice, counts }: { choice: DataChoice; onChoice: (update: (c: DataChoice) => DataChoice) => void; counts: Readonly<Record<HomePlace, number>> }) {
  const all = choice.kitchen.length === HOME_PLACES.length;
  const some = choice.kitchen.length > 0 && !all;
  const total = HOME_PLACES.reduce((n, p) => n + counts[p], 0);
  const tick = (p: HomePlace, on: boolean) => onChoice((c) => ({ ...c, kitchen: HOME_PLACES.filter((x) => (x === p ? on : c.kitchen.includes(x))) }));
  return (
    <>
      <div className="data-kitchen">
        <label className="radio-row small grow">
          <input
            type="checkbox"
            checked={all}
            ref={(el) => {
              if (el) el.indeterminate = some;
            }}
            onChange={(e) => onChoice((c) => ({ ...c, kitchen: e.target.checked ? [...HOME_PLACES] : [] }))}
          />{' '}
          {t(total === 1 ? 'data.kitchenOne' : 'data.kitchen', { n: total })}
        </label>
        <button
          type="button"
          className="btn btn-ghost data-kitchen-more"
          aria-expanded={choice.kitchenOpen}
          aria-label={t(choice.kitchenOpen ? 'data.kitchenLess' : 'data.kitchenMore')}
          onClick={() => onChoice((c) => ({ ...c, kitchenOpen: !c.kitchenOpen }))}
        >
          <span className={choice.kitchenOpen ? 'data-chip-turn-up' : 'data-chip-turn'} aria-hidden="true">
            <Icon name="chevron" size={16} />
          </span>
        </button>
      </div>
      {choice.kitchenOpen &&
        HOME_PLACES.map((p) => (
          <label key={p} className="radio-row small insights-share-sub">
            <input type="checkbox" checked={choice.kitchen.includes(p)} onChange={(e) => tick(p, e.target.checked)} /> {t('data.kitchenPlace', { place: placeName(p), n: counts[p] })}
          </label>
        ))}
    </>
  );
}
