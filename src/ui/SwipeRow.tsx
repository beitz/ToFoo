import { useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { Icon } from './Icon';

/** What a swipe to one side does, and how its layer under the row says so (in words, never colour alone). */
export interface SwipeAction {
  label: string;
  icon: string;
  run: () => void;
  /** Red for throwing away; the accent for anything else. */
  tone?: 'danger' | 'accent';
}

// Movement before a press counts as a swipe or a scroll, in px.
const SLOP = 10;
// How far to swipe before letting go acts: a third of the row, between these.
const MIN_REACH = 80;
const MAX_REACH = 140;
// The row sliding out, then the action; also in styles.css (.swipe-front).
const OUT_MS = 180;

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/**
 * A row that can be swiped sideways (owner, 2026-11-27: "swiping to the left and right is very
 * underutilized"): `left` acts on a swipe to the left, `right` on a swipe to the right. Past a third
 * of the row, letting go slides it out and acts; short of that it springs back. Vertical moves stay
 * scrolling, a tap stays a tap. A swipe is a shortcut only: whatever it does must also be reachable
 * by a tap elsewhere (screen readers and keyboards can't swipe).
 */
export function SwipeRow({ left, right, className, children }: { left?: SwipeAction; right?: SwipeAction; className?: string; children: ReactNode }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const front = useRef<HTMLDivElement>(null);
  const press = useRef<{ x: number; y: number; id: number; way?: 'side' | 'scroll'; width: number } | null>(null);
  // Set when a swipe ends, so the click that may follow does not also tap the row.
  const swiped = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const reach = (width: number) => Math.max(MIN_REACH, Math.min(MAX_REACH, width / 3));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swiped.current = false;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    press.current = { x: e.clientX, y: e.clientY, id: e.pointerId, width: front.current?.offsetWidth ?? 0 };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId || p.way === 'scroll') return;
    const mx = e.clientX - p.x;
    const my = e.clientY - p.y;
    if (!p.way) {
      if (Math.abs(mx) > SLOP && Math.abs(mx) > Math.abs(my)) {
        p.way = 'side';
        e.currentTarget.setPointerCapture(e.pointerId);
        setDragging(true);
      } else if (Math.abs(my) > SLOP) {
        p.way = 'scroll';
        return;
      } else return;
    }
    const x = (mx < 0 && !left) || (mx > 0 && !right) ? 0 : mx;
    const r = reach(p.width);
    // A short buzz where letting go starts to act (Android; other phones ignore it).
    if (Math.abs(x) >= r && Math.abs(dx) < r) navigator.vibrate?.(8);
    setDx(x);
  };
  const end = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const p = press.current;
    if (!p || p.id !== e.pointerId) return;
    press.current = null;
    if (p.way !== 'side') return;
    swiped.current = true;
    setDragging(false);
    const action = dx < 0 ? left : right;
    if (cancelled || !action || Math.abs(dx) < reach(p.width)) {
      setDx(0);
      return;
    }
    setDx(Math.sign(dx) * (p.width + 16));
    const act = () => {
      action.run();
      // Back in place if the row is still here (an undo brings it back as a new row anyway).
      timer.current = window.setTimeout(() => setDx(0), 600);
    };
    if (reducedMotion()) act();
    else timer.current = window.setTimeout(act, OUT_MS);
  };
  const onClickCapture = (e: MouseEvent) => {
    if (!swiped.current) return;
    swiped.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  const action = dx < 0 ? left : dx > 0 ? right : undefined;
  const armed = !!press.current && Math.abs(dx) >= reach(press.current.width);
  return (
    <div className={`swipe-row${className ? ` ${className}` : ''}`}>
      {action && (
        <div className={`swipe-under ${dx < 0 ? 'to-left' : 'to-right'} ${action.tone ?? 'accent'}${armed ? ' armed' : ''}`} aria-hidden>
          <Icon name={action.icon} size={20} />
          <span>{action.label}</span>
        </div>
      )}
      <div
        ref={front}
        className={`swipe-front${dragging ? ' dragging' : ''}`}
        style={dx ? { transform: `translateX(${dx}px)` } : undefined}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => end(e, false)}
        onPointerCancel={(e) => end(e, true)}
        onClickCapture={onClickCapture}
      >
        {children}
      </div>
    </div>
  );
}
