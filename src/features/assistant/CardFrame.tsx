import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';
import type { Undo } from './cards';

/**
 * What the chat gives every card around it (design 2026-10-22): "Correct", which starts a message
 * about this card in the chat box, the undo of its save for the kept one-line row, and where a meal
 * card reports what it adds, for "If you keep all".
 */
export interface CardFrameValue {
  id?: string;
  onChange?: () => void;
  undo?: Undo;
  setIntake?: (intake: Record<string, number> | undefined) => void;
}

export const CardFrame = createContext<CardFrameValue>({});

/** A kept card, folded to one line (owner's ask, 2026-10-22): what was saved, a link, and Undo. */
export function DoneRow({ children }: { children: ReactNode }) {
  const { undo } = useContext(CardFrame);
  const [undoing, setUndoing] = useState(false);
  return (
    <div className="card proposal-done row">
      <Icon name="check" size={18} />
      <span className="grow">{children}</span>
      {undo && (
        <button
          type="button"
          className="btn btn-small btn-ghost"
          disabled={undoing}
          onClick={async () => {
            setUndoing(true);
            try {
              await undo();
            } finally {
              setUndoing(false);
            }
          }}
        >
          <Icon name="undo" size={16} /> {t('common.undo')}
        </button>
      )}
    </div>
  );
}

/** "Correct" next to a card's save button: tell the assistant what is off about this card. */
export function ChangeButton() {
  const { onChange, id } = useContext(CardFrame);
  if (!onChange) return null;
  return (
    <button type="button" className="btn" onClick={onChange} aria-label={id ? t('ai.changeSpoken', { id }) : undefined}>
      {t('ai.correct')}
    </button>
  );
}

/** Report what this card would add (nutrient id → amount), while it is open. */
export function useCardIntake(intake: Record<string, number> | undefined, open: boolean) {
  const { setIntake } = useContext(CardFrame);
  const key = open && intake ? JSON.stringify(intake) : '';
  useEffect(() => {
    setIntake?.(key ? (JSON.parse(key) as Record<string, number>) : undefined);
  }, [key, setIntake]);
  useEffect(() => () => setIntake?.(undefined), [setIntake]);
}
