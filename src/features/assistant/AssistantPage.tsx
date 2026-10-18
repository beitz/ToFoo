import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { appNote, emptyConversation, sendMessage, type AiModel, type Conversation, type ShownNote, type ShownProposal, type ShownSleep, type ShownActivity, type ShownWater, type TurnOutcome } from '../../ai/assistant';
import { classifyError, getAiSettings, makeCreate, saveUsage } from '../../ai/client';
import { mergeModelTokens, type ModelTokens } from '../../ai/pricing';
import { prepareImage, type PreparedImage } from '../../ai/image';
import { photoLabel, readPhotoTime, type PhotoTime } from '../../ai/photoTime';
import { appendText, useDictation } from './useDictation';
import { RecordingTime } from './RecordingTime';
import { UsageLine } from './UsageLine';
import { VoiceFailed } from './VoiceFailed';
import type { ProposedItem, ProductTools } from '../../ai/tools';
import { findProduct, findUsda } from '../../foods/findProduct';
import { productLabel, productPageUrl, productRef } from '../../foods/products';
import type { FoodRef, Product } from '../../storage/types';
import { barcodesInPhoto } from '../log/barcode';
import type { EntryConfidence } from '../../model/types';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Field, NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { ConfidenceField } from '../log/ConfidenceField';
import { TimeField } from '../log/TimeField';
import { defaultTimeFor } from '../log/time';
import { sleepProblem } from '../sleep/SleepSheet';
import { durationText, spanText } from '../sleep/format';
import { waterText } from '../water/format';
import { waterProblem } from '../water/WaterSheet';
import { ActivityForm, activityName, DEFAULT_ACTIVITY_SKIN, recordOf, type ActivityDraft } from '../activity/ActivityForm';

type Bubble = { role: 'user'; text: string; previews: string[] } | { role: 'assistant'; text: string } | { role: 'card'; id: string };
type ComposerPhoto = PreparedImage & { barcodes: string[]; time: PhotoTime };
/** A proposed meal (M1, …), journal entry (J1, …), sleep (S1, …), activity (A1, …) or water (W1, …), and whether the user logged or saved it. */
type Card = { kind: 'meal'; proposal: ShownProposal; logged: boolean } | { kind: 'note'; note: ShownNote; logged: boolean } | { kind: 'sleep'; sleep: ShownSleep; logged: boolean } | { kind: 'activity'; activity: ShownActivity; logged: boolean } | { kind: 'water'; water: ShownWater; logged: boolean };
const cardOf = (c: Card) => (c.kind === 'meal' ? c.proposal : c.kind === 'note' ? c.note : c.kind === 'sleep' ? c.sleep : c.kind === 'activity' ? c.activity : c.water);
const cardId = (c: Card) => cardOf(c).id;
/** Undoes one saved card. */
type Undo = () => Promise<void>;
/** Saves a card as it is shown (with the user's edits); undefined if it cannot be saved as it is. */
type Saver = () => Promise<Undo | undefined>;

/** Photos per message: enough for a couple of days of meals; each one adds to the cost of every request in the chat. */
const MAX_PHOTOS = 50;
/**
 * Photo data per chat: every request carries the whole chat, photos included, and the API takes at
 * most 32 MB per request; the rest is left for the text. A scaled photo is about 0.2–0.5 MB.
 */
const MAX_PHOTO_BYTES = 24 * 1024 * 1024;

/** Log a meal by chatting: photos and/or text in, a checked list of BLS foods out. Route: #/assistant[/day]. */
export function AssistantPage({ day: dayParam }: { day?: string }) {
  const d = useData();
  const on = isOn(d.settings.features, 'aiAssistant');
  const [ai, setAi] = useState<{ apiKey: string; model: AiModel }>();
  useEffect(() => {
    void getAiSettings().then(setAi);
  }, []);

  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : d.today;
  const back = dayParam ? href('log', day) : href('log');

  let body;
  if (!on || (ai && !ai.apiKey)) {
    body = (
      <div className="card">
        <p>{t(on ? 'ai.needsKey' : 'ai.off')}</p>
        <a className="btn btn-primary" href={href('settings', 'assistant')}>
          {t('ai.openSettings')}
        </a>
      </div>
    );
  } else if (ai) {
    body = <Chat apiKey={ai.apiKey} model={ai.model} day={day} />;
  } else body = <p className="muted">{t('common.loading')}</p>;

  return (
    <section className="assistant-page">
      <header className="page-head row">
        <a className="icon-btn" href={back} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('ai.title')}</h1>
      </header>
      {body}
    </section>
  );
}

const ERROR_TEXT: Record<string, MessageKey> = {
  auth: 'ai.error.auth',
  rateLimit: 'ai.error.rateLimit',
  overloaded: 'ai.error.overloaded',
  network: 'ai.error.network',
  webSearchOff: 'ai.error.webSearchOff',
  other: 'ai.error.other',
  refusal: 'ai.error.refusal',
  tooLong: 'ai.error.tooLong',
  tooManySteps: 'ai.error.tooManySteps',
};

function Chat({ apiKey, model, day }: { apiKey: string; model: AiModel; day: string }) {
  const d = useData();
  const toast = useToast();
  const [conversation, setConversation] = useState<Conversation>(emptyConversation);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [cards, setCards] = useState<ReadonlyMap<string, Card>>(new Map());
  // Cards can be logged while the assistant is thinking, so its answer is matched against the latest state.
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  /** How each open card saves itself, for "Log all". */
  const savers = useRef(new Map<string, Saver>());
  const register = useCallback((id: string, save: Saver | undefined) => {
    if (save) savers.current.set(id, save);
    else savers.current.delete(id);
  }, []);
  const [savingAll, setSavingAll] = useState(false);
  const [text, setText] = useState('');
  const [images, setImages] = useState<ComposerPhoto[]>([]);
  /** Photos sent so far, so numbers stay unique across the chat, and their size (base64 characters). */
  const [photoCount, setPhotoCount] = useState(0);
  const [photoBytes, setPhotoBytes] = useState(0);
  /** Some of the text in the box was dictated: the assistant is told to expect misheard words. */
  const [dictated, setDictated] = useState(false);
  const offOn = isOn(d.settings.features, 'openFoodFacts');
  const usdaOn = isOn(d.settings.features, 'usda');
  const webSearchOn = isOn(d.settings.features, 'productWebSearch');
  // Products looked up in this chat stay usable for later proposals in it.
  const [seenProducts] = useState(() => new Map<string, Product>());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [create] = useState(() => makeCreate(apiKey));
  /** Billed tokens: the whole chat, and the user's latest message (all requests it caused). */
  const [chatTokens, setChatTokens] = useState<ModelTokens>({});
  const [turnTokens, setTurnTokens] = useState<ModelTokens>({});
  // Voice input (opt-in, OpenAI key): record, then the transcript lands in the text box.
  const dictation = useDictation({
    onText: (added, continued) => {
      setText((old) => appendText(old, added, continued));
      setDictated(true);
    },
    onError: setError,
  });
  const { recording, transcribing } = dictation;
  /** Index of the photo shown large, for looking at photos while talking about them. */
  const [viewing, setViewing] = useState<number>();

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [bubbles.length, busy]);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    setError(undefined);
    const picked = [...files].slice(0, Math.max(0, MAX_PHOTOS - images.length));
    if (picked.length < files.length) setError('ai.error.tooManyPhotos');
    try {
      // Capture time and barcodes come from the original file, on the phone (scaling drops EXIF);
      // the assistant gets them as text.
      const all = await Promise.all(
        picked.map(async (f): Promise<ComposerPhoto> => ({ ...(await prepareImage(f)), barcodes: offOn ? await barcodesInPhoto(f) : [], time: await readPhotoTime(f) })),
      );
      let room = MAX_PHOTO_BYTES - photoBytes - images.reduce((n, i) => n + i.data.length, 0);
      const prepared = all.filter((img) => (room -= img.data.length) >= 0);
      if (prepared.length < all.length) setError('ai.error.chatFull');
      // Oldest first, photos without a time last: the order the meals happened in.
      setImages((imgs) => [...imgs, ...prepared].sort((a, b) => (a.time.time ?? Infinity) - (b.time.time ?? Infinity)));
    } catch {
      setError('ai.error.photo');
    }
  }

  async function send() {
    if (busy || (!text.trim() && images.length === 0)) return;
    const all = [...cards.values()];
    const note = appNote({
      now: Date.now(),
      day,
      today: d.today,
      logged: all.filter((c) => c.logged).map(cardId),
      open: all.filter((c) => !c.logged).map(cardId),
      barcodes: [...new Set(images.flatMap((i) => i.barcodes))],
      dictated: dictated && !!text.trim(),
    });
    const labelled = images.map((img, i) => ({ ...img, label: photoLabel(photoCount + i + 1, img.time) }));
    const msg = { text, images: labelled, appNote: note };
    setBusy(true);
    setError(undefined);
    setBubbles((b) => [...b, { role: 'user', text: msg.text.trim(), previews: msg.images.map((i) => i.preview) }]);
    setText('');
    setImages([]);
    setDictated(false);
    setTurnTokens({});
    const onUsage = (tokens: ModelTokens) => {
      setChatTokens((c) => mergeModelTokens(c, tokens));
      setTurnTokens((c) => mergeModelTokens(c, tokens));
      void saveUsage(tokens);
    };
    try {
      const products: ProductTools | undefined =
        offOn || usdaOn
          ? {
              saved: d.productsById,
              seen: seenProducts,
              ...(offOn ? { find: (code: string) => findProduct(code), webSearch: webSearchOn } : {}),
              ...(usdaOn ? { searchUsda: (q: string, kind: 'generic' | 'branded') => findUsda(q, kind, 8) } : {}),
            }
          : undefined;
      const ctx = {
        db: d.foods,
        index: d.searchIndex,
        boost: d.searchBoost,
        products,
        now: Date.now(),
        journal: isOn(d.settings.features, 'journal'),
        sleep: isOn(d.settings.features, 'sleep'),
        activity: isOn(d.settings.features, 'activity'),
        water: isOn(d.settings.features, 'water'),
      };
      const r = await sendMessage(create, model, conversation, msg, ctx, onUsage);
      setConversation(r.conversation);
      setPhotoCount((n) => n + msg.images.length);
      setPhotoBytes((n) => n + msg.images.reduce((sum, i) => sum + i.data.length, 0));
      show(r.outcome);
    } catch (e) {
      // Nothing was added to the conversation: put the message back so a tap on Send retries it.
      setBubbles((b) => b.slice(0, -1));
      setText(msg.text);
      setImages(images);
      setDictated(dictated);
      setError(ERROR_TEXT[await classifyError(e)]);
    } finally {
      setBusy(false);
    }
  }

  function show(outcome: TurnOutcome) {
    if (outcome.kind === 'error') {
      setError(ERROR_TEXT[outcome.reason]);
      return;
    }
    const added: Bubble[] = outcome.text ? [{ role: 'assistant', text: outcome.text }] : [];
    if (outcome.kind === 'proposal') {
      // A correction replaces its open card: the old one goes, the new one appears at the end.
      const shown: Card[] = [
        ...outcome.proposals.map((p): Card => ({ kind: 'meal', proposal: p, logged: false })),
        ...outcome.notes.map((n): Card => ({ kind: 'note', note: n, logged: false })),
        ...outcome.sleeps.map((s): Card => ({ kind: 'sleep', sleep: s, logged: false })),
        ...outcome.activities.map((a): Card => ({ kind: 'activity', activity: a, logged: false })),
        ...outcome.waters.map((w): Card => ({ kind: 'water', water: w, logged: false })),
      ];
      const replaced = new Set(shown.map((c) => cardOf(c).replaces).filter((id): id is string => !!id && cardsRef.current.get(id)?.logged === false));
      setCards((all) => {
        const next = new Map([...all].filter(([id]) => !replaced.has(id)));
        for (const c of shown) next.set(cardId(c), c);
        return next;
      });
      setBubbles((b) => [...b.filter((x) => !(x.role === 'card' && replaced.has(x.id))), ...added, ...shown.map((c): Bubble => ({ role: 'card', id: cardId(c) }))]);
    } else setBubbles((b) => [...b, ...added]);
  }

  function setLogged(id: string, logged: boolean) {
    setCards((all) => {
      const card = all.get(id);
      return card ? new Map(all).set(id, { ...card, logged }) : all;
    });
  }

  // Everything proposed in this chat is logged: back to the log.
  useEffect(() => {
    if (cards.size > 0 && [...cards.values()].every((c) => c.logged)) navigate();
  }, [cards]);

  const timedOut = images.filter((i) => i.time.source !== 'photo').length;
  const openCards = [...cards.values()].filter((c) => !c.logged).map(cardId);

  /** Save every open card as shown, in the order shown, with one undo for all of them. */
  async function logAll() {
    if (savingAll) return;
    setSavingAll(true);
    const undos: Undo[] = [];
    try {
      for (const id of openCards) {
        const undo = await savers.current.get(id)?.();
        if (undo) undos.push(undo);
      }
    } finally {
      setSavingAll(false);
    }
    if (undos.length === 0) return;
    const skipped = openCards.length - undos.length;
    toast(skipped ? t('ai.loggedSome', { n: undos.length, total: openCards.length }) : t('ai.loggedAll', { n: undos.length }), async () => {
      for (const undo of undos) await undo();
    });
  }

  async function toggleRecording() {
    if (!recording) setError(undefined);
    await dictation.toggle();
  }

  const micButton =
    dictation.available ? (
      <button
        className={`icon-btn composer-btn${recording ? ' composer-recording' : ''}`}
        aria-label={t(recording ? 'voice.stop' : 'voice.record')}
        aria-pressed={recording}
        onClick={() => void toggleRecording()}
        disabled={transcribing}
      >
        <Icon name={recording ? 'stop' : 'mic'} filled={recording} />
      </button>
    ) : null;
  const voiceStatus =
    dictation.startedAt !== undefined ? (
      <p className="composer-note voice-status small" role="status">
        <span className="rec-dot" aria-hidden="true" /> <RecordingTime since={dictation.startedAt} />
      </p>
    ) : transcribing ? (
      <p className="composer-note muted small" role="status">
        {t('voice.transcribing')}
      </p>
    ) : dictation.failed ? (
      <VoiceFailed onRetry={dictation.retry} onDrop={dictation.drop} />
    ) : null;

  return (
    <>
      {/* While a photo is open, everything behind it is out of reach for touch and screen readers. */}
      <div className="chat" aria-live="polite" inert={viewing !== undefined}>
        <div className="bubble bubble-assistant">
          {t('ai.intro')}
          {isOn(d.settings.features, 'journal') && ` ${t('ai.introJournal')}`}
          {isOn(d.settings.features, 'sleep') && ` ${t('ai.introSleep')}`}
          {isOn(d.settings.features, 'activity') && ` ${t('ai.introActivity')}`}
          {isOn(d.settings.features, 'water') && ` ${t('ai.introWater')}`}
        </div>
        {bubbles.map((b, i) =>
          b.role === 'card' ? (
            cards.has(b.id) && <CardView key={b.id} card={cards.get(b.id)!} day={day} toast={toast} onLogged={(v) => setLogged(b.id, v)} register={register} />
          ) : b.role === 'user' ? (
            <div key={i} className="bubble bubble-user">
              {b.previews.length > 0 && (
                <div className="bubble-photos">
                  {b.previews.map((p, j) => (
                    <img key={j} src={p} alt={t('ai.photo')} />
                  ))}
                </div>
              )}
              {b.text && <p>{b.text}</p>}
            </div>
          ) : (
            <div key={i} className="bubble bubble-assistant">
              {b.text}
            </div>
          ),
        )}
        {openCards.length >= 2 && !busy && (
          <div className="log-all">
            <button className="btn btn-primary" disabled={savingAll} onClick={() => void logAll()}>
              {t('ai.logAll', { n: openCards.length })}
            </button>
          </div>
        )}
        {busy && <div className="bubble bubble-assistant muted">{t('ai.thinking')}</div>}
        {error && (
          <div className="card notice-card" role="alert">
            <Icon name="alert" size={18} /> {t(error)}
          </div>
        )}
        <UsageLine chat={chatTokens} turn={turnTokens} model={model} />
        <div ref={endRef} />
      </div>

      <div className="composer" inert={viewing !== undefined}>
        {images.length > 0 && (
          <div className="composer-photos">
            {images.map((img, i) => (
              <div key={i} className="composer-photo">
                <button className="composer-photo-open" aria-label={t('viewer.open', { n: i + 1 })} onClick={() => setViewing(i)}>
                  <img src={img.preview} alt="" />
                </button>
                <span className="composer-photo-time small">{photoTimeShort(img.time)}</span>
                <button className="icon-btn" aria-label={t('ai.removePhoto')} onClick={() => setImages((all) => all.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {timedOut > 0 && <p className="composer-note muted small">{t('ai.photoTimesMissing', { n: timedOut })}</p>}
        {micButton && images.length > 0 && !voiceStatus && <p className="composer-note muted small">{t('viewer.hint')}</p>}
        {voiceStatus}
        <div className="composer-row">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ''))} />
          <button className="icon-btn composer-btn" aria-label={t('ai.addPhoto')} onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="camera" />
          </button>
          {micButton}
          <textarea
            rows={1}
            value={text}
            placeholder={t('ai.placeholder')}
            aria-label={t('ai.placeholder')}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="enter"
            onKeyDown={(e) => {
              // On a phone keyboard Enter is the only way to start a new line, so only the send
              // button sends there; with a real keyboard Enter sends and Shift+Enter breaks the line.
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !touchKeyboard()) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            className="icon-btn composer-btn composer-send"
            aria-label={t('ai.send')}
            onClick={() => void send()}
            disabled={busy || dictation.busy || (!text.trim() && images.length === 0)}
          >
            <Icon name="send" />
          </button>
        </div>
      </div>
      {viewing !== undefined && images[viewing] && (
        <PhotoViewer images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(undefined)} controls={micButton} status={voiceStatus} />
      )}
    </>
  );
}

/** The chosen photos, large, one at a time: look through them while talking about them. */
function PhotoViewer({
  images,
  index,
  onIndex,
  onClose,
  controls,
  status,
}: {
  images: ComposerPhoto[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  controls: ReactNode;
  status: ReactNode;
}) {
  const img = images[index]!;
  const touchX = useRef<number | undefined>(undefined);
  const go = (delta: number) => onIndex(Math.min(images.length - 1, Math.max(0, index + delta)));
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') go(-1);
      if (e.key === 'ArrowRight') go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  return (
    <div className="photo-viewer" role="dialog" aria-modal="true" aria-label={t('viewer.title', { n: index + 1, total: images.length })}>
      <div className="photo-viewer-head">
        <span>
          {t('viewer.title', { n: index + 1, total: images.length })} · {photoTimeShort(img.time)}
        </span>
        <button className="icon-btn" aria-label={t('viewer.close')} onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      <div
        className="photo-viewer-image"
        onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX)}
        onTouchEnd={(e) => {
          const start = touchX.current;
          const end = e.changedTouches[0]?.clientX;
          // A deliberate horizontal swipe, not a tap.
          if (start !== undefined && end !== undefined && Math.abs(end - start) > 50) go(end < start ? 1 : -1);
          touchX.current = undefined;
        }}
      >
        <img src={img.preview} alt={t('ai.photo')} />
      </div>
      {status}
      <div className="photo-viewer-controls">
        <button className="icon-btn" aria-label={t('viewer.prev')} onClick={() => go(-1)} disabled={index === 0}>
          <Icon name="back" />
        </button>
        {controls}
        <button className="icon-btn" aria-label={t('viewer.next')} onClick={() => go(1)} disabled={index === images.length - 1}>
          <Icon name="chevron" />
        </button>
      </div>
    </div>
  );
}

/** A touch screen without a fine pointer: the keyboard is on screen. */
function touchKeyboard(): boolean {
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** What this chat has cost so far, from the token counts the API reports (an estimate at list prices). */
/** Capture time under a photo thumbnail: "Thu 19:42", "≈ Thu 19:42" from the file date, or "–". */
function photoTimeShort(pt: PhotoTime): string {
  if (pt.time === undefined) return '–';
  const s = `${new Date(pt.time).toLocaleDateString('en-GB', { weekday: 'short' })} ${formatTime(pt.time)}`;
  return pt.source === 'photo' ? s : `≈ ${s}`;
}

type CardProps<C extends Card> = {
  card: C;
  day: string;
  toast: ReturnType<typeof useToast>;
  onLogged: (logged: boolean) => void;
  register: (id: string, save: Saver | undefined) => void;
};

/** Keep the chat's "Log all" pointed at this card's latest save (with the user's edits) while it is open. */
function useRegister(id: string, save: Saver | undefined, register: CardProps<Card>['register']) {
  useEffect(() => {
    register(id, save);
  });
  useEffect(() => () => register(id, undefined), [id, register]);
}

function CardView({ card, ...rest }: CardProps<Card>) {
  if (card.kind === 'meal') return <ProposalCard card={card} {...rest} />;
  if (card.kind === 'sleep') return <SleepCard card={card} {...rest} />;
  if (card.kind === 'activity') return <ActivityCard card={card} {...rest} />;
  if (card.kind === 'water') return <WaterProposalCard card={card} {...rest} />;
  return <NoteCard card={card} {...rest} />;
}

/** A sleep the assistant proposes: check or adjust both times, then save (replacing any sleep at that time). */
function SleepCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'sleep' }>>) {
  const { sleep } = card;
  const [start, setStart] = useState(sleep.start);
  const [end, setEnd] = useState(sleep.end);
  const [saving, setSaving] = useState(false);
  const problem = sleepProblem({ start, end });

  async function save(): Promise<Undo | undefined> {
    if (problem || saving) return;
    setSaving(true);
    try {
      const { saved, replaced } = await repo.saveSleep({ start, end });
      onLogged(true);
      return async () => {
        await repo.undoSleep(saved, replaced);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(sleep.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('sleep.saved', { duration: durationText(end - start) }), undo);
  }

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.sleepSaved', { span: spanText({ start, end }) })} <a href={href('diary', dayKey(new Date(end)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="bed" size={18} /> {t('sleep.short')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {sleep.id}
        </span>
      </div>
      <TimeField label={t('sleep.fellAsleep')} value={start} onChange={setStart} />
      <TimeField label={t('sleep.wokeUp')} value={end} onChange={setEnd} />
      <div className="sheet-actions">
        <span className={problem ? 'notice small' : 'muted'} role={problem ? 'alert' : undefined}>
          {problem ?? durationText(end - start)}
        </span>
        <button className="btn btn-primary" disabled={!!problem || saving} onClick={() => void saveOne()}>
          {t('ai.saveSleep')}
        </button>
      </div>
    </div>
  );
}

/** Plain water the assistant proposes: check or adjust the amount and time, then save. */
function WaterProposalCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'water' }>>) {
  const { water } = card;
  const d = useData();
  const [ml, setMl] = useState<number | undefined>(water.ml);
  const [time, setTime] = useState(() => water.time ?? defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);
  const problem = waterProblem(ml);

  async function save(): Promise<Undo | undefined> {
    if (problem || !ml || saving) return;
    setSaving(true);
    try {
      const added = await repo.addWater({ ml: Math.round(ml), time, day: dayKey(new Date(time)) });
      onLogged(true);
      return async () => {
        await repo.deleteWater(added.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(water.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo && ml) toast(t('water.added', { amount: waterText(ml) }), undo);
  }

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.waterSaved', { amount: waterText(ml ?? 0), when: `${formatDay(dayKey(new Date(time)))}, ${formatTime(time)}` })} <a href={href('diary', dayKey(new Date(time)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="drop" size={18} /> {t('water.title')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {water.id}
        </span>
      </div>
      <Field label={t('water.amount')}>{(id) => <NumberInput id={id} value={ml} onChange={setMl} suffix="ml" min={0} />}</Field>
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        {problem && (
          <span className="notice small" role="alert">
            {problem}
          </span>
        )}
        <button className="btn btn-primary" disabled={!!problem || saving} onClick={() => void saveOne()}>
          {t('ai.saveWater')}
        </button>
      </div>
    </div>
  );
}

/** An activity the assistant proposes: a summary to check, the full form behind Change, then save. */
function ActivityCard({ card, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'activity' }>>) {
  const { activity } = card;
  const [draft, setDraft] = useState<ActivityDraft>(() => ({
    kind: activity.kind,
    name: activity.name ?? '',
    time: activity.start,
    minutes: activity.minutes,
    intensity: activity.intensity ?? 'moderate',
    outside: activity.outside,
    sun: true,
    skin: activity.skin ?? DEFAULT_ACTIVITY_SKIN,
  }));
  const [changing, setChanging] = useState(false);
  const [saving, setSaving] = useState(false);
  const r = recordOf(draft);

  async function save(): Promise<Undo | undefined> {
    if (!r.ok || saving) return;
    setSaving(true);
    try {
      const added = await repo.addActivity({ ...r.fields, day: dayKey(new Date(r.fields.time)) });
      onLogged(true);
      return async () => {
        await repo.deleteActivity(added.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(activity.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('activity.saved'), undo);
  }

  const summary = [
    formatTime(draft.time),
    t('activity.summary', { min: draft.minutes ?? '–' }),
    t(`activity.intensity.${draft.intensity}` as MessageKey),
    ...(draft.outside ? [t('activity.outsideMark')] : []),
  ].join(' · ');

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.activitySaved', { name: activityName(draft), summary })} <a href={href('diary', dayKey(new Date(draft.time)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="activity" size={18} /> {activityName(draft)}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {activity.id}
        </span>
      </div>
      {changing ? (
        <ActivityForm draft={draft} onChange={setDraft} />
      ) : (
        <p className="muted">
          {formatDay(dayKey(new Date(draft.time)))}, {summary}
          {draft.outside && draft.sun && ` · ${t('ai.activitySun')}`}
        </p>
      )}
      <div className="sheet-actions">
        {!r.ok && (
          <span className="notice small" role="alert">
            {r.problem}
          </span>
        )}
        {!changing && (
          <button className="btn btn-ghost" onClick={() => setChanging(true)}>
            {t('ai.change')}
          </button>
        )}
        <button className="btn btn-primary" disabled={!r.ok || saving} onClick={() => void saveOne()}>
          {t('ai.saveActivity')}
        </button>
      </div>
    </div>
  );
}

/** A journal entry the assistant proposes: check or edit the words and time, then save. */
function NoteCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'note' }>>) {
  const { note } = card;
  const d = useData();
  const [text, setText] = useState(note.text);
  const [time, setTime] = useState(() => note.time ?? defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);

  async function save(): Promise<Undo | undefined> {
    if (!text.trim() || saving) return;
    setSaving(true);
    try {
      const added = await repo.addJournal({ time, day: dayKey(new Date(time)), text: text.trim() });
      onLogged(true);
      return async () => {
        await repo.deleteJournal(added.id);
        onLogged(false);
      };
    } finally {
      setSaving(false);
    }
  }
  useRegister(note.id, card.logged ? undefined : save, register);

  async function saveOne() {
    const undo = await save();
    if (undo) toast(t('journal.saved'), undo);
  }

  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.noteSaved', { when: `${new Date(time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(time)}` })}{' '}
          <a href={href('diary', dayKey(new Date(time)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong className="journal-label">
          <Icon name="journal" size={18} /> {t('ai.noteTitle')}
        </strong>
        <span className="muted small" title={t('ai.cardId')}>
          {note.id}
        </span>
      </div>
      <textarea className="note-text" rows={3} value={text} aria-label={t('ai.noteTitle')} onChange={(e) => setText(e.target.value)} />
      <TimeField value={time} onChange={setTime} />
      <div className="sheet-actions">
        <button className="btn btn-primary" disabled={!text.trim() || saving} onClick={() => void saveOne()}>
          {t('ai.saveNote')}
        </button>
      </div>
    </div>
  );
}

/** One meal the assistant proposes: check, adjust grams and time, remove items, then log. */
function ProposalCard({ card, day, toast, onLogged, register }: CardProps<Extract<Card, { kind: 'meal' }>>) {
  const { proposal } = card;
  const d = useData();
  const [items, setItems] = useState<Array<Omit<ProposedItem, 'grams'> & { grams: number | undefined }>>(proposal.items);
  const [confidence, setConfidence] = useState<EntryConfidence>(proposal.confidence);
  const [time, setTime] = useState(() => proposal.time ?? defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);
  const valid = items.length > 0 && items.every((i) => i.grams && i.grams > 0);
  const kcal = items.reduce((sum, i) => {
    const v = i.food.per100.ENERCC;
    return typeof v === 'number' && i.grams ? sum + (v * i.grams) / 100 : sum;
  }, 0);

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving) return;
    setSaving(true);
    const ids: string[] = [];
    try {
      for (const it of items) {
        let ref: FoodRef = { source: 'BLS', version: d.foods.version, code: it.food.code };
        if (it.product) {
          await repo.saveProduct(it.product);
          await repo.setProductMatch(it.product.id, it.product.match ?? null);
          ref = productRef(it.product);
        }
        const entry = await repo.addLog({
          kind: 'food',
          ref,
          grams: it.grams!,
          preparation: it.preparation,
          time,
          day: dayKey(new Date(time)),
          confidence,
          label: it.product ? productLabel(it.product) : it.food.nameEn,
        });
        ids.push(entry.id);
      }
    } finally {
      setSaving(false);
    }
    onLogged(true);
    return async () => {
      for (const id of ids) await repo.deleteLog(id);
      onLogged(false);
    };
  }
  useRegister(proposal.id, card.logged ? undefined : save, register);

  async function log() {
    const undo = await save();
    if (undo) toast(t('ai.logged'), undo);
  }

  const title = proposal.summary || t('ai.proposal');
  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>
          {t('ai.cardLogged', { name: title, when: `${new Date(time).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${formatTime(time)}` })}{' '}
          <a href={href('diary', dayKey(new Date(time)))}>{t('edit.inDiary')}</a>
        </span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong>{title}</strong>
        <span className="muted small" title={t('ai.cardId')}>
          {proposal.id}
        </span>
      </div>
      <ul className="plain-list">
        {items.map((it, i) => (
          <li key={`${it.food.code}-${i}`} className="proposal-item">
            <div className="proposal-name">
              {it.product ? (
                <a href={productPageUrl(it.product)} target="_blank" rel="noreferrer">
                  {productLabel(it.product)}
                </a>
              ) : (
                <a href={href('food', it.food.code)}>{it.food.nameEn}</a>
              )}
              <span className="muted small block">{it.note || it.food.nameDe}</span>
              {it.product?.match && (
                <span className="muted small block">{t('ai.microsFrom', { name: d.foods.byCode.get(it.product.match.code)?.nameEn ?? it.product.match.code })}</span>
              )}
            </div>
            <NumberInput value={it.grams} onChange={(g) => setItems((all) => all.map((x, j) => (j === i ? { ...x, grams: g } : x)))} suffix="g" min={0} />
            <button className="icon-btn" aria-label={t('ai.removeItem', { name: it.food.nameEn })} onClick={() => setItems((all) => all.filter((_, j) => j !== i))}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {proposal.assumptions.length > 0 && (
        <div className="small">
          <span className="muted">{t('ai.assumptions')}</span>
          <ul className="assumptions">
            {proposal.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      <ConfidenceField value={confidence} onChange={setConfidence} />
      <TimeField value={time} onChange={setTime} />
      <p className="muted small">{t('ai.correctHint')}</p>
      <div className="sheet-actions">
        <span className="muted">{fmtNumber(kcal)} kcal</span>
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void log()}>
          {t('ai.log')}
        </button>
      </div>
    </div>
  );
}
