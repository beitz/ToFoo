import type { ReactNode } from 'react';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { formatTime, weekdayShort, dayKey } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { keepAllPreview } from '../../logic/keepAll';
import { symbolOf } from '../../ui/Tile';
import { cardSpan, cardTitle, stripRange, type Card } from './cards';

/** Where the card with this id sits in the chat, for the time strip to jump to. */
export const cardAnchor = (id: string) => `card-${id}`;

/**
 * An answer with several cards (design 2026-10-22, replaces the pages): the assistant's text, a time
 * strip that stays at the top while the cards scroll past (tap a block to jump to its card), the
 * cards one under the other, and at the bottom what keeping all of them would do, with Keep all.
 */
export function ProposalGroup({
  text,
  ids,
  cards,
  intakes,
  fallbackTime,
  renderCard,
  onKeepAll,
  savingAll,
  busy,
}: {
  text: string;
  ids: readonly string[];
  cards: ReadonlyMap<string, Card>;
  intakes: ReadonlyMap<string, Record<string, number>>;
  fallbackTime: number;
  renderCard: (id: string) => ReactNode;
  onKeepAll: (ids: string[]) => void;
  savingAll: boolean;
  busy: boolean;
}) {
  const d = useData();
  const shown = ids.filter((id) => cards.has(id));
  const open = shown.filter((id) => !cards.get(id)!.logged);
  const preview = keepAllPreview(
    open.flatMap((id) => (intakes.has(id) ? [intakes.get(id)!] : [])),
    d.model.nutrients,
    d.requirements,
    d.settings.shortWindowDays,
  );
  return (
    <div className="proposal-group">
      {text && <div className="bubble bubble-assistant">{text}</div>}
      <TimeStrip ids={shown} cards={cards} fallbackTime={fallbackTime} />
      {shown.map((id) => renderCard(id))}
      {open.length >= 2 && (
        <div className="keep-all">
          {(preview.moves.length > 0 || preview.kcal > 0) && (
            <div className="keep-all-preview small">
              <span className="muted">{t('ai.keepAllPreview')}</span>
              {preview.moves.map((m) => (
                <a key={m.id} className="keep-chip" href={href('nutrient', m.id)} aria-label={t('ai.keepAllMoveSpoken', { name: symbolOf(m.id), before: m.before, after: m.after })}>
                  <strong>{symbolOf(m.id)}</strong> {m.before}→{m.after}
                </a>
              ))}
              {preview.kcal > 0 && <span className="keep-chip">+{fmtNumber(preview.kcal)} kcal</span>}
            </div>
          )}
          <button className="btn btn-primary" disabled={savingAll || busy} onClick={() => onKeepAll(open)}>
            {t('ai.logAll', { n: open.length })}
          </button>
        </div>
      )}
    </div>
  );
}

/** The cards on a line of time: dashed while open, solid once kept; a block jumps to its card. */
function TimeStrip({ ids, cards, fallbackTime }: { ids: readonly string[]; cards: ReadonlyMap<string, Card>; fallbackTime: number }) {
  const timed = ids.flatMap((id) => {
    const c = cards.get(id)!;
    const span = cardSpan(c, fallbackTime);
    return span ? [{ id, c, span }] : [];
  });
  const range = stripRange(timed.map((x) => x.span));
  if (!range || timed.length < 2) return null;
  const pos = (time: number) => ((time - range.from) / (range.to - range.from)) * 100;
  const label = (time: number) => {
    const day = dayKey(new Date(time));
    return time === ticks[0] || formatTime(time) === '00:00' ? `${weekdayShort(day)} ${formatTime(time)}` : formatTime(time);
  };
  // Whole hours, spread over the strip: three or four labels.
  const HOUR = 3_600_000;
  const step = Math.max(1, Math.ceil((range.to - range.from) / HOUR / 3)) * HOUR;
  const firstTick = Math.ceil(range.from / HOUR) * HOUR;
  const ticks: number[] = [];
  for (let tick = firstTick; tick <= range.to; tick += step) ticks.push(tick);
  return (
    <nav className="time-strip" aria-label={t('ai.timeStrip')}>
      <div className="time-track">
        {timed.map(({ id, c, span }) => (
          <a
            key={id}
            href={`#${cardAnchor(id)}`}
            className={`time-block${c.logged ? ' kept' : ''}`}
            style={{ left: `${pos(span.start)}%`, width: `max(22px, ${pos(span.end) - pos(span.start)}%)` }}
            aria-label={`${id} ${cardTitle(c)}, ${label(span.start)}${c.logged ? `, ${t('pages.saved')}` : ''}`}
            onClick={(e) => {
              // A hash link would be taken as a route: scroll instead.
              e.preventDefault();
              document.getElementById(cardAnchor(id))?.scrollIntoView({ block: 'center', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
            }}
          >
            {id}
          </a>
        ))}
      </div>
      <div className="time-ticks small" aria-hidden>
        {ticks.map((tick) => (
          <span key={tick} style={{ left: `${pos(tick)}%` }}>
            {label(tick)}
          </span>
        ))}
      </div>
    </nav>
  );
}
