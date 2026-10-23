import { useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { Sheet } from './controls';

/**
 * ⓘ in a card's corner: the card's explanations in a sheet, so the card itself can show pictures
 * and numbers only (owner's ask, 2026-10-23: explanations on request, never cluttering the page).
 */
export function InfoButton({ title, label, children }: { title: string; label?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="icon-btn info-btn" aria-label={label ?? title} onClick={() => setOpen(true)}>
        <Icon name="info" size={20} />
      </button>
      {open &&
        createPortal(
          <Sheet title={title} onClose={() => setOpen(false)}>
            <div className="info-sheet">{children}</div>
          </Sheet>,
          document.body,
        )}
    </>
  );
}
