import { useRef } from 'react';
import { t } from '../../i18n';
import type { FoodIconName } from '../../logic/foodIcons';
import { HOME_KINDS, type HomeKind } from '../../logic/homeKind';
import type { MessageKey } from '../../i18n';
import { FoodIcon } from '../../ui/FoodIcon';

export interface HomeTile {
  key: string;
  icon?: FoodIconName;
  monogram: string;
  /** Under the icon (src/logic/foodIcons.ts `shortNames`). */
  short: string;
  /** The whole name, for screen readers and the sheet a hold opens. */
  full: string;
  /** How much is left and where, for screen readers. */
  detail: string;
  /** How many were added to the meal being logged, shown as "+2". */
  added: number;
  onTap: () => void;
  /** What a hold opens; missing: a hold does what a tap does (the Kitchen tab opens the thing either way). */
  onHold?: () => void;
  /** Used up: the icon greyed out, the name struck through. */
  out?: boolean;
  /** Its kind, the colour of its ring (src/logic/homeKind.ts). */
  kind?: HomeKind;
}

/** A kind's name, as the group headings and screen readers say it. */
export const kindName = (k: HomeKind) => t(`kind.${k}` as MessageKey);

/** How long a press is held before it opens the sheet instead of adding one. */
const HOLD_MS = 450;
/** A finger that moves this far is scrolling, not pressing. */
const MOVE_PX = 10;

/**
 * Things at home as round icons with short names (owner's idea, 2026-11-07): many fit above the
 * keyboard where list rows did not. A tap adds one; holding (or a right click, or the context-menu
 * key) opens the amount sheet with the full name, as a tap did before.
 */
export function HomeTiles({ tiles, hintId, grouped }: { tiles: readonly HomeTile[]; hintId?: string; grouped?: boolean }) {
  const list = (some: readonly HomeTile[]) => (
    <ul className="home-tiles">
      {some.map((tile) => (
        <li key={tile.key}>
          <Tile tile={tile} hintId={hintId} />
        </li>
      ))}
    </ul>
  );
  // Grouped by kind (Log meal) under a heading with the ring's colour, so colour is never the only clue.
  const kinds = HOME_KINDS.filter((k) => tiles.some((x) => x.kind === k));
  if (!grouped || kinds.length < 2) return list(tiles);
  return (
    <>
      {kinds.map((k) => (
        <div key={k} className="home-tiles-group">
          <h3 className={`home-tiles-kind kind-${k}`}>{kindName(k)}</h3>
          {list(tiles.filter((x) => x.kind === k))}
        </div>
      ))}
    </>
  );
}

function Tile({ tile, hintId }: { tile: HomeTile; hintId?: string }) {
  const press = useRef<{ x: number; y: number; timer: number } | null>(null);
  // Set once a hold has opened the sheet, so the click that may follow does not add one too.
  const held = useRef(false);
  const cancel = () => {
    if (press.current) window.clearTimeout(press.current.timer);
    press.current = null;
  };
  const hold = () => {
    cancel();
    held.current = true;
    (tile.onHold ?? tile.onTap)();
  };
  return (
    <button
      type="button"
      className={`home-tile${tile.out ? ' out' : ''}`}
      aria-label={`${tile.full}${tile.detail ? `, ${tile.detail}` : ''}${tile.kind ? `, ${kindName(tile.kind)}` : ''}${tile.added ? `, ${t('log.tileAdded', { n: tile.added })}` : ''}`}
      aria-describedby={hintId}
      onPointerDown={(e) => {
        held.current = false;
        cancel();
        press.current = { x: e.clientX, y: e.clientY, timer: window.setTimeout(hold, HOLD_MS) };
      }}
      onPointerMove={(e) => {
        if (press.current && Math.hypot(e.clientX - press.current.x, e.clientY - press.current.y) > MOVE_PX) cancel();
      }}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onPointerCancel={cancel}
      onContextMenu={(e) => {
        // Android's long press, a right click and the context-menu key all end up here.
        e.preventDefault();
        if (!held.current) hold();
      }}
      onClick={() => {
        if (held.current) {
          held.current = false;
          return;
        }
        tile.onTap();
      }}
    >
      <span className="home-tile-ring">
        <FoodIcon icon={tile.icon} monogram={tile.monogram} kind={tile.kind} />
        {tile.added > 0 && (
          <span className="home-tile-added" aria-hidden>
            +{tile.added}
          </span>
        )}
      </span>
      <span className="home-tile-name">{tile.short}</span>
    </button>
  );
}
