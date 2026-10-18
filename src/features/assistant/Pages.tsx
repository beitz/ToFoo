import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { useBackCloses } from '../../app/history';
import { t } from '../../i18n';
import { Icon } from '../../ui/Icon';
import { cardTitle, type Card } from './cards';
import { appendText } from './useDictation';

/** Where the microphone's text goes while the pages are open: the comment box of the page shown. */
export type DictationTarget = MutableRefObject<((added: string, continued: boolean) => void) | null>;

const INTRO = 'intro';
const SUMMARY = 'summary';

/**
 * An answer with several cards, one page each (docs/SPEC.md, "One assistant"): the assistant's text
 * first, then a page per card with its own accept button, then a summary with Accept all and Reply.
 * Each page has a comment box; Reply sends all comments as one message, each marked with its card
 * so the assistant knows which part it is about. Every page stays mounted (hidden when not shown),
 * so edits on a card survive paging and "Log all" can save it.
 */
export function Pages({
  text,
  ids,
  cards,
  open,
  onClose,
  renderCard,
  onReply,
  onAcceptAll,
  savingAll,
  busy,
  mic,
  voiceStatus,
  dictationTarget,
}: {
  text: string;
  ids: readonly string[];
  cards: ReadonlyMap<string, Card>;
  open: boolean;
  onClose: () => void;
  renderCard: (id: string) => ReactNode;
  onReply: (text: string, dictated: boolean) => void;
  onAcceptAll: (ids: string[]) => Promise<void>;
  savingAll: boolean;
  busy: boolean;
  mic: ReactNode;
  voiceStatus: ReactNode;
  dictationTarget: DictationTarget;
}) {
  const shown = ids.filter((id) => cards.has(id));
  const keys = [...(text ? [INTRO] : []), ...shown, SUMMARY];
  const [index, setIndex] = useState(0);
  const at = Math.min(index, keys.length - 1);
  const key = keys[at]!;
  const [comments, setComments] = useState<Record<string, string>>({});
  const [dictated, setDictated] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  useBackCloses(open, onClose);

  const go = (i: number) => {
    setIndex(Math.max(0, Math.min(keys.length - 1, i)));
    bodyRef.current?.scrollTo?.({ top: 0 });
  };

  // Accepting a card moves on to the next page.
  const wasLogged = useRef(new Map<string, boolean>());
  useEffect(() => {
    const before = wasLogged.current.get(key);
    const now = cards.get(key)?.logged;
    if (open && before === false && now) go(at + 1);
    wasLogged.current = new Map(shown.map((id) => [id, cards.get(id)?.logged ?? false]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  // The microphone fills the comment box of the page shown while the pages are open.
  const keyRef = useRef(key);
  keyRef.current = key;
  useEffect(() => {
    if (!open) return;
    const target = (added: string, continued: boolean) => {
      const k = keyRef.current;
      setComments((c) => ({ ...c, [k]: appendText(c[k] ?? '', added, continued) }));
      setDictated(true);
    };
    dictationTarget.current = target;
    return () => {
      if (dictationTarget.current === target) dictationTarget.current = null;
    };
  }, [open, dictationTarget]);

  const open_ = shown.filter((id) => !cards.get(id)!.logged);
  const reply = () => {
    const parts: string[] = [];
    const intro = comments[INTRO]?.trim();
    if (intro) parts.push(intro);
    for (const id of shown) {
      const c = comments[id]?.trim();
      if (c) parts.push(t('pages.about', { id, title: cardTitle(cards.get(id)!), text: c }));
    }
    const general = comments[SUMMARY]?.trim();
    if (general) parts.push(general);
    return parts.join('\n\n');
  };
  const replyText = reply();

  function sendReply() {
    if (!replyText || busy) return;
    onReply(replyText, dictated);
    setComments({});
    setDictated(false);
  }

  const card = cards.get(key);
  const title = key === INTRO ? t('pages.answer') : key === SUMMARY ? t('pages.summary') : card ? cardTitle(card) : '';
  const commentLabel = key === SUMMARY ? t('pages.replyLabel') : key === INTRO ? t('pages.commentIntro') : t('pages.commentCard', { id: key });

  return (
    <div className="pages" role="dialog" aria-modal="true" aria-label={t('pages.label', { n: at + 1, total: keys.length })} hidden={!open}>
      <header className="pages-head">
        <button className="icon-btn" onClick={onClose} aria-label={t('pages.close')}>
          <Icon name="back" />
        </button>
        <div className="pages-title">
          <strong>{title}</strong>
          <span className="muted small">{t('pages.position', { n: at + 1, total: keys.length })}</span>
        </div>
      </header>
      <ol className="pages-dots" aria-hidden="true">
        {keys.map((k, i) => (
          <li key={k} className={`${i === at ? 'current' : ''}${cards.get(k)?.logged ? ' done' : ''}`} />
        ))}
      </ol>
      <div className="pages-body" ref={bodyRef}>
        {text && (
          <div hidden={key !== INTRO}>
            <div className="bubble bubble-assistant pages-text">{text}</div>
            <p className="muted small">{t('pages.coming', { n: shown.length })}</p>
            <ol className="pages-parts small">
              {shown.map((id) => (
                <li key={id}>
                  <span className="muted">{id}</span> {cardTitle(cards.get(id)!)}
                </li>
              ))}
            </ol>
          </div>
        )}
        {shown.map((id) => (
          <div key={id} hidden={key !== id}>
            {renderCard(id)}
          </div>
        ))}
        <div hidden={key !== SUMMARY}>
          {text && <div className="bubble bubble-assistant pages-text">{text}</div>}
          <ul className="pages-list card">
            {shown.map((id) => {
              const c = cards.get(id)!;
              const comment = comments[id]?.trim();
              return (
                <li key={id}>
                  <button className="pages-row" onClick={() => go(keys.indexOf(id))}>
                    <span className="pages-row-main">
                      <span>
                        <span className="muted small">{id}</span> {cardTitle(c)}
                      </span>
                      {comment && <span className="muted small block">{t('pages.yourComment', { text: comment })}</span>}
                    </span>
                    <span className={`pages-state small${c.logged ? ' done' : ''}`}>
                      {c.logged ? (
                        <>
                          <Icon name="check" size={16} /> {t('pages.saved')}
                        </>
                      ) : (
                        t('pages.open')
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {open_.length === 0 && <p className="muted small">{t('pages.allSaved')}</p>}
        </div>
      </div>
      <footer className="pages-foot">
        {voiceStatus}
        <div className="pages-comment">
          <textarea
            rows={1}
            value={comments[key] ?? ''}
            placeholder={commentLabel}
            aria-label={commentLabel}
            onChange={(e) => setComments((c) => ({ ...c, [key]: e.target.value }))}
          />
          {mic}
        </div>
        <div className="pages-nav">
          <button className="btn btn-ghost" onClick={() => go(at - 1)} disabled={at === 0} aria-label={t('pages.prev')}>
            <Icon name="back" size={18} />
            {key !== SUMMARY && <span>{t('pages.prevShort')}</span>}
          </button>
          {key === SUMMARY ? (
            <>
              <button className="btn btn-ghost" onClick={sendReply} disabled={!replyText || busy}>
                {t('pages.reply')}
              </button>
              <button className="btn btn-primary" onClick={() => void onAcceptAll(open_)} disabled={open_.length === 0 || savingAll}>
                {t('pages.acceptAll', { n: open_.length })}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => go(at + 1)}>
              <span>{at === keys.length - 2 ? t('pages.toSummary') : t('pages.next')}</span>
              <Icon name="chevron" size={18} />
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
