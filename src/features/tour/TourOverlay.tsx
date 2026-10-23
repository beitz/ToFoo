import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useBackCloses } from '../../app/history';
import { navigate } from '../../app/router';
import { t } from '../../i18n';
import { TOURS, type TourId, type TourStep } from './tours';

/** Room around the outlined element, in px. */
const PAD = 6;
/** How long the screen may take to draw a step's element (sample data, a fan opening). */
const SETTLE_MS = 250;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** The first element with this marker that is actually drawn (some screens render a marker twice, one hidden). */
function findTarget(name: string): HTMLElement | undefined {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden') return el;
  }
  return undefined;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * One tour on screen: the screen dims, the step's element gets an outline, and a bubble says one line
 * with Next and Skip. Taps outside the bubble do nothing, so nobody leaves by accident; the back
 * button skips. Steps whose element isn't there are left out.
 */
export function TourOverlay({ id, profileEmpty, onDone, onNoTours }: { id: TourId; profileEmpty: boolean; onDone: () => void; onNoTours: () => void }) {
  const [steps, setSteps] = useState<TourStep[]>();
  const [index, setIndex] = useState(0);
  const [box, setBox] = useState<Box | null>();
  const next = useRef<HTMLButtonElement>(null);
  const scrolling = useRef(false);
  // The host passes new callbacks on every render; effects read the latest without restarting.
  const done = useRef(onDone);
  done.current = onDone;
  useBackCloses(true, onDone);

  // Which steps this screen can show, once it has drawn (the sample week, the fan's items).
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const present = TOURS[id].steps.filter((s) => !s.target || findTarget(s.target));
      if (present.length === 0) done.current();
      else setSteps(present);
    }, SETTLE_MS);
    return () => window.clearTimeout(timer);
  }, [id]);

  const step = steps?.[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = step.target ? findTarget(step.target) : undefined;
    if (!el) {
      setBox(null);
      return;
    }
    const r = el.getBoundingClientRect();
    setBox({ top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 });
  }, [step]);

  // Bring the element into view (Stores and Next to cook sit below the fold), then outline it.
  useLayoutEffect(() => {
    if (!step) return;
    const el = step.target ? findTarget(step.target) : undefined;
    if (step.target && !el) {
      // Gone since the tour started: move on.
      setIndex((i) => i + 1);
      return;
    }
    setBox(undefined);
    let timer = 0;
    let settle: (() => void) | undefined;
    if (el) {
      const r = el.getBoundingClientRect();
      const fixed = getComputedStyle(el).position === 'fixed' || !!el.closest('.bottom-nav, .fab-stack');
      // Below the sample band at the top, and high enough to leave room for the bubble under it.
      const visible = r.top >= 32 && r.bottom <= window.innerHeight * 0.62;
      if (!fixed && !visible) {
        const smooth = !reducedMotion();
        // Outline it once the page has stopped moving, so the bubble doesn't chase a moving card.
        scrolling.current = true;
        settle = () => {
          scrolling.current = false;
          window.clearTimeout(timer);
          measure();
        };
        const behavior = smooth ? 'smooth' : 'auto';
        // A tall card goes to the top, its heading clear of the sample band; anything else to the middle.
        if (r.height > window.innerHeight * 0.45) window.scrollTo({ top: window.scrollY + r.top - 44, behavior });
        else el.scrollIntoView({ block: 'center', behavior });
        if (smooth) window.addEventListener('scrollend', settle, { once: true });
        timer = window.setTimeout(settle, smooth ? 900 : 30);
      } else measure();
    } else measure();
    return () => {
      window.clearTimeout(timer);
      if (settle) window.removeEventListener('scrollend', settle);
      scrolling.current = false;
    };
  }, [step, measure]);

  useEffect(() => {
    const follow = () => {
      if (!scrolling.current) measure();
    };
    window.addEventListener('resize', follow);
    window.addEventListener('scroll', follow, { passive: true });
    return () => {
      window.removeEventListener('resize', follow);
      window.removeEventListener('scroll', follow);
    };
  }, [measure]);

  useEffect(() => {
    if (steps && index >= steps.length) done.current();
  }, [steps, index]);

  useEffect(() => {
    if (box !== undefined) next.current?.focus({ preventScroll: true });
  }, [box, index]);

  if (!steps || !step || box === undefined) return <div className="tour-blocker" aria-hidden />;

  const last = index === steps.length - 1;
  const first = index === 0;
  // The bubble goes on the side of the element with more room; over a card taller than half the
  // screen it sits low, so the card's heading stays readable.
  const vh = window.innerHeight;
  const tall = !!box && box.height > vh * 0.45;
  const below = box ? box.top + box.height / 2 < vh / 2 : false;
  const bubbleStyle = !box
    ? undefined
    : tall
      ? { bottom: 84 }
      : below
        ? { top: Math.min(box.top + box.height + 12, vh - 180) }
        : { bottom: Math.min(vh - box.top + 12, vh - 180) };

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-label={t('tour.label')}>
      <div className="tour-blocker" />
      {box ? <div className="tour-spot" style={box} aria-hidden /> : <div className="tour-dim" aria-hidden />}
      <div className={`tour-bubble${box ? '' : ' tour-bubble-center'}`} style={bubbleStyle}>
        <p className="tour-text" aria-live="polite">
          {t(step.text)}
        </p>
        {step.profileButton && profileEmpty && (
          <button
            type="button"
            className="btn btn-secondary btn-small tour-extra"
            onClick={() => {
              onDone();
              navigate('settings', 'profile');
            }}
          >
            {t('tour.setUpProfile')}
          </button>
        )}
        {first && id === 'home' && (
          <button type="button" className="tour-link small" onClick={onNoTours}>
            {t('tour.noTours')}
          </button>
        )}
        <div className="tour-foot">
          <span className="small muted tour-count">{t('tour.count', { n: index + 1, of: steps.length })}</span>
          {!last && (
            <button type="button" className="btn btn-ghost btn-small" onClick={onDone}>
              {t('tour.skip')}
            </button>
          )}
          <button ref={next} type="button" className="btn btn-primary btn-small" onClick={() => (last ? onDone() : setIndex(index + 1))}>
            {last ? t('tour.done') : t('tour.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
