import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { useBackCloses } from '../../app/history';
import { SourceTag } from '../recipes/SourceTag';
import { t, type MessageKey } from '../../i18n';
import { dayKey, formatDay, formatTime } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import {
  appNote,
  chatSetup,
  emptyConversation,
  retirePhotos,
  sendMessage,
  type AiModel,
  type Conversation,
  type TurnOutcome,
} from '../../ai/assistant';
import { describeAiError, getAiSettings, logAiError, makeCreate, saveUsage } from '../../ai/client';
import { errorText } from '../../lib/shareFile';
import { cardSummary, itemSummary, localTimes } from '../../ai/chatRecord';
import { ChatRecorder } from '../../ai/chatStore';
import { ChatExport } from './ChatExport';
import { mergeModelTokens, type ModelTokens } from '../../ai/pricing';
import { prepareImage, type PreparedImage } from '../../ai/image';
import { photoLabel, readPhotoTime, type PhotoTime } from '../../ai/photoTime';
import { appendText, useDictation } from './useDictation';
import { RecordingTime } from './RecordingTime';
import { UsageLine } from './UsageLine';
import { VoiceFailed } from './VoiceFailed';
import type { ProposedItem, ProductTools, RecipeTools } from '../../ai/tools';
import { findProduct, findUsda } from '../../foods/findProduct';
import { productLabel, productPageUrl, productRef } from '../../foods/products';
import type { FoodRef, Ingredient, Product } from '../../storage/types';
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
import { IngredientSheet } from '../recipes/IngredientSheet';
import { ActivityForm, activityName, DEFAULT_ACTIVITY_SKIN, recordOf, type ActivityDraft } from '../activity/ActivityForm';
import { cardId, cardOf, cardTitle, useRegister, type Card, type CardProps, type RecipeChat, type Saver, type Undo } from './cards';
import { RecipeCard } from './RecipeCard';
import { ShoppingCard } from './ShoppingCard';
import { BatchCard, PortionCard } from './BatchCards';
import { Pages, type DictationTarget } from './Pages';
import { refKey } from '../../lib/refs';
import { itemIngredient } from '../../logic/ingredients';
import { checkPortion, describeCheck, describeStatus, gapFoods, oftenEaten, portionIntake, recipeInfos } from '../../logic/recipeIdeas';
import type { AppData } from '../../app/data';

export type { RecipeChat } from './cards';

/** A chat bubble; an answer with several cards is one 'pages' bubble, its cards shown as pages. */
type Bubble =
  | { role: 'user'; text: string; previews: string[] }
  | { role: 'assistant'; text: string }
  | { role: 'card'; id: string }
  | { role: 'pages'; key: number; text: string; ids: string[] };
type ComposerPhoto = PreparedImage & { barcodes: string[]; time: PhotoTime };
/** Photos per message: enough for a couple of days of meals; each one adds to the cost of every request in the chat. */
const MAX_PHOTOS = 50;
/**
 * Photo data per chat: every request carries the whole chat, photos included, and the API takes at
 * most 32 MB per request; the rest is left for the text. A scaled photo is about 0.2–0.5 MB.
 */
const MAX_PHOTO_BYTES = 24 * 1024 * 1024;

/** The chat once the assistant is on and has a key; otherwise why not, with a way to the settings. */
function ChatOrNotice({ chat }: { chat: (ai: { apiKey: string; model: AiModel }) => ReactNode }) {
  const d = useData();
  const on = isOn(d.settings.features, 'aiAssistant');
  const [ai, setAi] = useState<{ apiKey: string; model: AiModel }>();
  useEffect(() => {
    void getAiSettings().then(setAi);
  }, []);
  if (!on || (ai && !ai.apiKey)) {
    return (
      <div className="card">
        <p>{t(on ? 'ai.needsKey' : 'ai.off')}</p>
        <a className="btn btn-primary" href={href('settings', 'assistant')}>
          {t('ai.openSettings')}
        </a>
      </div>
    );
  }
  if (ai) return <>{chat(ai)}</>;
  return <p className="muted">{t('common.loading')}</p>;
}

/**
 * The assistant inside the recipe editor: photos of a recipe, a typed or spoken list, packages and
 * barcodes in; ingredients with grams out, added to the recipe once the user confirms them.
 */
export function RecipeAssistant({ recipe, onClose }: { recipe: RecipeChat; onClose: () => void }) {
  const d = useData();
  return (
    <section className="assistant-page">
      <header className="page-head row">
        <button className="icon-btn" onClick={onClose} aria-label={t('recipes.backToRecipe')}>
          <Icon name="back" />
        </button>
        <h1>{t('ai.recipeTitle')}</h1>
      </header>
      <ChatOrNotice chat={(ai) => <Chat apiKey={ai.apiKey} model={ai.model} day={d.today} recipe={recipe} />} />
    </section>
  );
}

/**
 * The assistant: meals, journal, sleep, activity, water and recipes in one chat, photos, text and
 * voice in, cards to check out. Route: #/assistant (from Home) or #/assistant/day (from the log
 * screen of that day).
 */
export function AssistantPage({ day: dayParam }: { day?: string }) {
  const d = useData();
  const day = dayParam && /^\d{4}-\d{2}-\d{2}$/.test(dayParam) ? dayParam : d.today;
  const back = dayParam ? href('log', day) : href();
  const body = <ChatOrNotice chat={(ai) => <Chat apiKey={ai.apiKey} model={ai.model} day={day} />} />;

  return (
    <section className="assistant-page">
      <header className="page-head row">
        <a className="icon-btn" href={back} aria-label={t('common.back')}>
          <Icon name="back" />
        </a>
        <h1>{t('ai.pageTitle')}</h1>
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
  rejected: 'ai.error.rejected',
  app: 'ai.error.app',
  other: 'ai.error.other',
  refusal: 'ai.error.refusal',
  tooLong: 'ai.error.tooLong',
  tooManySteps: 'ai.error.tooManySteps',
};

function Chat({ apiKey, model, day, recipe }: { apiKey: string; model: AiModel; day: string; recipe?: RecipeChat }) {
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
  /** The answer shown as pages right now (its bubble key), if any. */
  const [pagesOpen, setPagesOpen] = useState<number>();
  const pagesKey = useRef(0);
  /** While pages are open, the microphone fills the comment box of the page shown. */
  const dictationTarget: DictationTarget = useRef(null);
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
  /** The error shown above the composer, with the exact cause where there is one. */
  const [error, setError] = useState<{ key: MessageKey; detail?: string }>();
  const showError = (key: MessageKey) => setError({ key });
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [create] = useState(() => makeCreate(apiKey));
  /** Saves the chat on the phone as it goes, for exporting it later (Settings → AI assistant → Saved chats). */
  const [recorder] = useState(
    () => new ChatRecorder({ kind: recipe ? 'recipe' : 'log', model, ...(recipe ? {} : { day }), features: d.settings.features }, isOn(d.settings.features, 'saveChats')),
  );
  /** Billed tokens: the whole chat, and the user's latest message (all requests it caused). */
  const [chatTokens, setChatTokens] = useState<ModelTokens>({});
  const [turnTokens, setTurnTokens] = useState<ModelTokens>({});
  // Voice input (opt-in, OpenAI key): record, then the transcript lands in the text box.
  const dictation = useDictation({
    onText: (added, continued) => {
      if (dictationTarget.current) return dictationTarget.current(added, continued);
      setText((old) => appendText(old, added, continued));
      setDictated(true);
    },
    onError: showError,
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
    if (picked.length < files.length) showError('ai.error.tooManyPhotos');
    try {
      // Capture time and barcodes come from the original file, on the phone (scaling drops EXIF);
      // the assistant gets them as text.
      const all = await Promise.all(
        picked.map(async (f): Promise<ComposerPhoto> => ({ ...(await prepareImage(f)), barcodes: offOn ? await barcodesInPhoto(f) : [], time: await readPhotoTime(f) })),
      );
      let room = MAX_PHOTO_BYTES - photoBytes - images.reduce((n, i) => n + i.data.length, 0);
      const prepared = all.filter((img) => (room -= img.data.length) >= 0);
      if (prepared.length < all.length) showError('ai.error.chatFull');
      // Oldest first, photos without a time last: the order the meals happened in.
      setImages((imgs) => [...imgs, ...prepared].sort((a, b) => (a.time.time ?? Infinity) - (b.time.time ?? Infinity)));
    } catch (e) {
      const detail = errorText(e);
      logAiError('photo', model, { kind: 'photo', detail }, e);
      setError({ key: 'ai.error.photo', detail });
    }
  }

  /** The recipe book for the assistant, and with recipe ideas on, the app's numbers for ideas. */
  function recipeTools(): RecipeTools {
    const nameOf = (ing: Ingredient) => (ing.ref.source === 'BLS' ? (d.foods.byCode.get(ing.ref.code)?.nameEn ?? ing.name) : (d.productsById.get(refKey(ing.ref)) ? productLabel(d.productsById.get(refKey(ing.ref))!) : ing.name));
    const tools: RecipeTools = { list: recipeInfos(d.recipes, d.batches, d.today), nameOf };
    if (!isOn(d.settings.features, 'recipeIdeas')) return tools;
    const hidden = new Set(d.settings.hiddenNutrients);
    return {
      ...tools,
      ideas: {
        exclusions: d.profile.exclusions,
        gaps: () => ideasOverview(d, hidden),
        check: (items, portions) => {
          const products = new Map([...d.productsById, ...items.flatMap((it) => (it.product ? [[it.product.id, it.product] as const] : []))]);
          const ctx = { foods: d.foods, products, batches: new Map(), customFoods: new Map(), salt: d.profile.salt };
          const ingredients = items.map((it) => itemIngredient(it, d.foods.version, d.profile.salt));
          return describeCheck(checkPortion(portionIntake({ name: '', portions, ingredients }, ctx), d.model.nutrients, d.requirements), portions);
        },
        checkSaved: (id) => {
          const r = d.recipes.find((x) => x.id === id);
          if (!r) return undefined;
          const ctx = { foods: d.foods, products: d.productsById, batches: new Map(), customFoods: new Map(), salt: r.saltOverride ?? d.profile.salt };
          return describeCheck(checkPortion(portionIntake(r, ctx), d.model.nutrients, d.requirements), r.portions);
        },
      },
    };
  }

  /** Send the composer's text and photos, or a reply written on an answer's pages. */
  async function send(reply?: { text: string; dictated: boolean }) {
    const text_ = reply ? reply.text : text;
    const images_ = reply ? [] : images;
    const dictated_ = reply ? reply.dictated : dictated;
    if (busy || (!text_.trim() && images_.length === 0)) return;
    const all = [...cards.values()];
    const note = appNote({
      now: Date.now(),
      day,
      today: d.today,
      logged: all.filter((c) => c.logged).map(cardId),
      open: all.filter((c) => !c.logged).map(cardId),
      barcodes: [...new Set(images_.flatMap((i) => i.barcodes))],
      dictated: dictated_ && !!text_.trim(),
      ...(recipe ? { recipe: recipe.soFar() } : {}),
    });
    const labelled = images_.map((img, i) => ({ ...img, label: photoLabel(photoCount + i + 1, img.time) }));
    const msg = { text: text_, images: labelled, appNote: note };
    setBusy(true);
    setError(undefined);
    recorder.event({ type: 'user', text: msg.text.trim(), photos: labelled.map((i) => i.label), ...(dictated_ && msg.text.trim() ? { dictated: true } : {}) });
    setBubbles((b) => [...b, { role: 'user', text: msg.text.trim(), previews: msg.images.map((i) => i.preview) }]);
    if (!reply) {
      setText('');
      setImages([]);
      setDictated(false);
    }
    setTurnTokens({});
    const onUsage = (tokens: ModelTokens) => {
      setChatTokens((c) => mergeModelTokens(c, tokens));
      setTurnTokens((c) => mergeModelTokens(c, tokens));
      recorder.usage(tokens);
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
        // The recipe editor's assistant proposes ingredients and nothing else.
        ...(recipe
          ? { recipe: true }
          : {
              journal: isOn(d.settings.features, 'journal'),
              sleep: isOn(d.settings.features, 'sleep'),
              activity: isOn(d.settings.features, 'activity'),
              water: isOn(d.settings.features, 'water'),
              shopping: isOn(d.settings.features, 'shoppingList'),
              recipes: recipeTools(),
            }),
      };
      // Photos whose cards are all saved leave the chat, so this and later requests don't pay for them again.
      const lighter = retirePhotos(conversation, (id) => !cardsRef.current.get(id) || !!cardsRef.current.get(id)?.logged);
      const r = await sendMessage(create, model, lighter, msg, ctx, onUsage);
      setConversation(r.conversation);
      recorder.conversation(r.conversation.messages, chatSetup(ctx));
      setPhotoCount((n) => n + msg.images.length);
      setPhotoBytes((n) => n + msg.images.reduce((sum, i) => sum + i.data.length, 0));
      show(r.outcome);
    } catch (e) {
      // Nothing was added to the conversation: put the message back so a tap on Send retries it.
      setBubbles((b) => b.slice(0, -1));
      // A failed reply from the pages lands in the box too, unless the user is already typing there.
      if (!reply || !text.trim()) {
        setText(msg.text);
        setDictated(dictated_);
      }
      if (!reply) setImages(images);
      const failure = await describeAiError(e);
      recorder.event({ type: 'error', reason: failure.kind, detail: failure.detail });
      logAiError(recipe ? 'recipe' : 'assistant', model, failure, e);
      setError({ key: ERROR_TEXT[failure.kind]!, detail: failure.detail });
    } finally {
      setBusy(false);
    }
  }

  function show(outcome: TurnOutcome) {
    if (outcome.kind === 'error') {
      recorder.event({ type: 'error', reason: outcome.reason });
      logAiError(recipe ? 'recipe' : 'assistant', model, { kind: outcome.reason });
      setError({ key: ERROR_TEXT[outcome.reason]! });
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
        ...outcome.shopping.map((l): Card => ({ kind: 'shopping', shopping: l, logged: false })),
        ...outcome.ingredients.map((r): Card => ({ kind: 'ingredients', ingredients: r, logged: false })),
        ...outcome.recipes.map((r): Card => ({ kind: 'recipe', recipe: r, logged: false })),
        ...outcome.portions.map((p): Card => ({ kind: 'portion', portion: p, logged: false })),
        ...outcome.batches.map((b): Card => ({ kind: 'batch', batch: b, logged: false })),
      ];
      // In the order the assistant proposed them, so a day reads in order and related cards sit together.
      const rank = (c: Card) => outcome.order.indexOf(cardId(c));
      shown.sort((a, b) => rank(a) - rank(b));
      recorder.event({ type: 'cards', text: outcome.text, cards: shown.map((c) => cardSummary(cardOf(c))) });
      const replaced = new Set(shown.map((c) => cardOf(c).replaces).filter((id): id is string => !!id && cardsRef.current.get(id)?.logged === false));
      setCards((all) => {
        const next = new Map([...all].filter(([id]) => !replaced.has(id)));
        for (const c of shown) next.set(cardId(c), c);
        return next;
      });
      // Several cards are one answer in pages (the text on the first page); one card stays in the chat.
      const paged = shown.length >= 2 && !recipe;
      const key = ++pagesKey.current;
      const next: Bubble[] = paged ? [{ role: 'pages', key, text: outcome.text, ids: shown.map(cardId) }] : [...added, ...shown.map((c): Bubble => ({ role: 'card', id: cardId(c) }))];
      setBubbles((b) => [...b.filter((x) => !(x.role === 'card' && replaced.has(x.id))), ...next]);
      if (paged) setPagesOpen(key);
    } else {
      recorder.event({ type: 'assistant', text: outcome.text });
      setBubbles((b) => [...b, ...added]);
    }
  }

  /** A card was saved (with what was saved, for the saved chat) or its save undone. */
  function setLogged(id: string, logged: boolean, saved?: Record<string, unknown>) {
    recorder.event(logged ? { type: 'saved', card: id, saved: saved ?? {} } : { type: 'undone', card: id });
    setCards((all) => {
      const card = all.get(id);
      return card ? new Map(all).set(id, { ...card, logged }) : all;
    });
  }

  // Everything proposed in this chat is logged: back to the log (or the recipe).
  const recipeDone = recipe?.done;
  useEffect(() => {
    if (cards.size > 0 && [...cards.values()].every((c) => c.logged)) {
      if (recipeDone) recipeDone();
      else navigate();
    }
  }, [cards, recipeDone]);

  const timedOut = images.filter((i) => i.time.source !== 'photo').length;
  const openCards = [...cards.values()].filter((c) => !c.logged).map(cardId);

  /** Save these open cards (all by default) as shown, in the order shown, with one undo for all of them. */
  async function logAll(ids: readonly string[] = openCards) {
    if (savingAll) return;
    setSavingAll(true);
    const undos: Undo[] = [];
    try {
      for (const id of ids) {
        const undo = await savers.current.get(id)?.();
        if (undo) undos.push(undo);
      }
    } finally {
      setSavingAll(false);
    }
    if (undos.length === 0) return;
    const skipped = ids.length - undos.length;
    toast(skipped ? t('ai.loggedSome', { n: undos.length, total: ids.length }) : t('ai.loggedAll', { n: undos.length }), async () => {
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

  const renderCard = (id: string) => <CardView key={id} card={cards.get(id)!} day={day} toast={toast} onLogged={(v, saved) => setLogged(id, v, saved)} register={register} recipe={recipe} />;

  return (
    <>
      {/* While a photo is open, everything behind it is out of reach for touch and screen readers. */}
      <div className="chat" aria-live="polite" inert={viewing !== undefined || pagesOpen !== undefined}>
        {recipe ? (
          <div className="bubble bubble-assistant">{t('ai.recipeIntro')}</div>
        ) : (
          <div className="bubble bubble-assistant">
            {t('ai.intro')} {t('ai.introAlso')}{' '}
            {[
              isOn(d.settings.features, 'journal') && t('ai.introJournal'),
              isOn(d.settings.features, 'sleep') && t('ai.introSleep'),
              isOn(d.settings.features, 'activity') && t('ai.introActivity'),
              isOn(d.settings.features, 'water') && t('ai.introWater'),
              isOn(d.settings.features, 'shoppingList') && t('ai.introShopping'),
              t('ai.introRecipes'),
            ]
              .filter(Boolean)
              .join(', ')}
            .{isOn(d.settings.features, 'recipeIdeas') && ` ${t('ai.introIdeas')}`}
          </div>
        )}
        {bubbles.map((b, i) =>
          b.role === 'card' ? (
            cards.has(b.id) && renderCard(b.id)
          ) : b.role === 'pages' ? (
            <PagesBubble key={`p${b.key}`} text={b.text} ids={b.ids} cards={cards} onOpen={() => setPagesOpen(b.key)} />
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
        {openCards.length >= 2 && !busy && !recipe && (
          <div className="log-all">
            <button className="btn btn-primary" disabled={savingAll} onClick={() => void logAll()}>
              {t('ai.logAll', { n: openCards.length })}
            </button>
          </div>
        )}
        {busy && <div className="bubble bubble-assistant muted">{t('ai.thinking')}</div>}
        {error && (
          <div className="card notice-card" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <p>{t(error.key)}</p>
              {error.detail && <p className="small error-detail">{t('ai.error.detail', { detail: error.detail })}</p>}
            </div>
          </div>
        )}
        <UsageLine chat={chatTokens} turn={turnTokens} model={model} />
        {/* Also after a first message that failed: the saved chat holds the error to share. */}
        {recorder.enabled && (bubbles.length > 0 || !!error) && !busy && <ChatExport recorder={recorder} />}
        <div ref={endRef} />
      </div>

      <div className="composer" inert={viewing !== undefined || pagesOpen !== undefined}>
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
            placeholder={t(recipe ? 'ai.recipePlaceholder' : 'ai.placeholderAll')}
            aria-label={t(recipe ? 'ai.recipePlaceholder' : 'ai.placeholderAll')}
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
      {bubbles.map(
        (b) =>
          b.role === 'pages' && (
            <Pages
              key={`pages${b.key}`}
              text={b.text}
              ids={b.ids}
              cards={cards}
              open={pagesOpen === b.key && viewing === undefined}
              onClose={() => setPagesOpen((k) => (k === b.key ? undefined : k))}
              renderCard={renderCard}
              onReply={(reply, spoken) => {
                setPagesOpen(undefined);
                void send({ text: reply, dictated: spoken });
              }}
              onAcceptAll={(ids) => logAll(ids)}
              savingAll={savingAll}
              busy={busy}
              mic={micButton}
              voiceStatus={voiceStatus}
              dictationTarget={dictationTarget}
            />
          ),
      )}
      {viewing !== undefined && images[viewing] && (
        <PhotoViewer images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(undefined)} controls={micButton} status={voiceStatus} />
      )}
    </>
  );
}

/**
 * nutrient_gaps' answer, computed when the assistant asks: the status per nutrient, the foods that
 * fill the gaps, what the user ate most lately, their exclusions and their cooking preferences.
 */
function ideasOverview(d: AppData, hidden: ReadonlySet<string>): string {
  const ex = d.profile.exclusions;
  const excluded = [...ex.groups.map((g) => `${d.foods.groups[g]?.en ?? g} (whole group)`), ...ex.foods.map((c) => d.foods.byCode.get(c)?.nameEn ?? c)];
  const fill = gapFoods(d.foods, d.model.nutrients, d.requirements, ex);
  const often = oftenEaten(d.log, d.today, 30);
  const prefs = d.settings.cookingPreferences?.trim();
  return [
    `Nutrient status (app-computed, as on the user's Home screen):\n${describeStatus(d.model.nutrients, hidden) || 'Nothing logged yet.'}`,
    `Foods that fill the gaps best:\n${fill.length ? fill.join('\n') : 'No gaps right now.'}`,
    `Eaten most in the last 30 days: ${often.length ? often.join('; ') : 'nothing logged.'}`,
    `Excluded by the user (never use these in ideas): ${excluded.length ? excluded.join('; ') : 'none.'}`,
    `Cooking preferences, in the user's words: ${prefs ? `\n${prefs}` : 'none written.'}`,
  ].join('\n\n');
}

/** An answer in pages, as it sits in the chat: the start of its text, its cards with their state, and a way back into the pages. */
function PagesBubble({ text, ids, cards, onOpen }: { text: string; ids: readonly string[]; cards: ReadonlyMap<string, Card>; onOpen: () => void }) {
  const shown = ids.filter((id) => cards.has(id));
  if (shown.length === 0 && !text) return null;
  return (
    <div className="bubble bubble-assistant pages-bubble">
      {text && <p className="pages-preview">{text}</p>}
      <ul className="pages-parts small">
        {shown.map((id) => {
          const c = cards.get(id)!;
          return (
            <li key={id} className={c.logged ? 'done' : undefined}>
              {c.logged ? <Icon name="check" size={14} /> : <span className="pages-bullet" aria-hidden="true" />} <span className="muted">{id}</span> {cardTitle(c)}
              {c.logged && <span className="visually-hidden"> ({t('pages.saved')})</span>}
            </li>
          );
        })}
      </ul>
      {shown.length > 0 && (
        <button className="btn btn-small btn-primary" onClick={onOpen}>
          {t('pages.openPages', { n: shown.length })}
        </button>
      )}
    </div>
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
  useBackCloses(true, onClose);
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

function CardView({ card, ...rest }: CardProps<Card>) {
  if (card.kind === 'meal') return <ProposalCard card={card} {...rest} />;
  if (card.kind === 'sleep') return <SleepCard card={card} {...rest} />;
  if (card.kind === 'activity') return <ActivityCard card={card} {...rest} />;
  if (card.kind === 'water') return <WaterProposalCard card={card} {...rest} />;
  if (card.kind === 'shopping') return <ShoppingCard card={card} {...rest} />;
  if (card.kind === 'ingredients') return <IngredientsCard card={card} {...rest} />;
  if (card.kind === 'recipe') return <RecipeCard card={card} {...rest} />;
  if (card.kind === 'portion') return <PortionCard card={card} {...rest} />;
  if (card.kind === 'batch') return <BatchCard card={card} {...rest} />;
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
      onLogged(true, localTimes({ start, end }));
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
      onLogged(true, localTimes({ ml: added.ml, time }));
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
      onLogged(true, localTimes({ ...r.fields }));
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
      onLogged(true, localTimes({ text: added.text, time }));
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
    onLogged(true, localTimes({ time, confidence, items: items.map(itemSummary) }));
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

/** Ingredients the assistant proposes for the recipe being edited: check, adjust grams, remove items, then add. */
function IngredientsCard({ card, toast, onLogged, register, recipe }: CardProps<Extract<Card, { kind: 'ingredients' }>>) {
  const { ingredients: proposal } = card;
  const d = useData();
  const [items, setItems] = useState<Array<Omit<ProposedItem, 'grams'> & { grams: number | undefined }>>(proposal.items);
  const [instructions, setInstructions] = useState(proposal.instructions ?? '');
  /** The item open in the ingredient sheet (change its food, amount or preparation). */
  const [editing, setEditing] = useState<number>();
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState(proposal.items.length);
  const valid = !!recipe && (items.length > 0 || !!instructions.trim()) && items.every((i) => i.grams && i.grams > 0);
  const kcal = items.reduce((sum, i) => {
    const v = i.food.per100.ENERCC;
    return typeof v === 'number' && i.grams ? sum + (v * i.grams) / 100 : sum;
  }, 0);

  async function save(): Promise<Undo | undefined> {
    if (!valid || saving || !recipe) return;
    setSaving(true);
    try {
      // Products and USDA foods are saved on this phone, as when a meal is logged, so the recipe can refer to them.
      for (const it of items) {
        if (!it.product) continue;
        await repo.saveProduct(it.product);
        await repo.setProductMatch(it.product.id, it.product.match ?? null);
      }
    } finally {
      setSaving(false);
    }
    const undo = recipe.add({ name: proposal.name, portions: proposal.portions, items: items.map((it) => ({ ...it, grams: it.grams! })), instructions });
    setCount(items.length);
    onLogged(true, { items: items.map(itemSummary), ...(instructions.trim() ? { instructions: instructions.trim() } : {}) });
    return async () => {
      undo();
      onLogged(false);
    };
  }
  useRegister(proposal.id, card.logged ? undefined : save, register);

  async function add() {
    const undo = await save();
    if (undo) toast(items.length ? t('ai.ingredientsAdded', { n: items.length }) : t('ai.stepsAdded'), undo);
  }

  const title = proposal.name || t('ai.ingredientsTitle');
  if (card.logged) {
    return (
      <div className="card proposal-done row">
        <Icon name="check" size={18} />
        <span>{count ? t('ai.ingredientsDone', { n: count }) : t('ai.stepsDone')}</span>
      </div>
    );
  }

  return (
    <div className="card proposal">
      <div className="row-between">
        <strong>
          {title}
          {proposal.portions ? <span className="muted small"> · {t('recipes.portions', { n: proposal.portions })}</span> : null}
        </strong>
        <span className="muted small" title={t('ai.cardIdRecipe')}>
          {proposal.id}
        </span>
      </div>
      <ul className="plain-list">
        {items.map((it, i) => (
          <li key={`${it.food.code}-${i}`} className="proposal-item">
            {/* Tap to change the food (another BLS food, a product, USDA, a barcode), amount or preparation. */}
            <button className="proposal-name ingredient-name" onClick={() => setEditing(i)} aria-label={t('recipes.changeIngredient', { name: it.product ? productLabel(it.product) : it.food.nameEn })}>
              <span className="link-like">
                {it.product ? productLabel(it.product) : it.food.nameEn} <Icon name="edit" size={14} />
              </span>
              <span className="muted small block">
                <SourceTag source={it.product?.source ?? 'BLS'} product={it.product} /> {it.note || it.food.nameDe}
                {it.preparation !== 'asListed' && ` · ${t(`prep.${it.preparation}` as MessageKey)}`}
              </span>
              {it.product?.match && (
                <span className="muted small block">{t('recipes.microsFromLine', { name: d.foods.byCode.get(it.product.match.code)?.nameEn ?? it.product.match.code })}</span>
              )}
            </button>
            <NumberInput value={it.grams} onChange={(g) => setItems((all) => all.map((x, j) => (j === i ? { ...x, grams: g } : x)))} suffix="g" min={0} />
            <button className="icon-btn" aria-label={t('ai.removeItem', { name: it.food.nameEn })} onClick={() => setItems((all) => all.filter((_, j) => j !== i))}>
              <Icon name="trash" size={18} />
            </button>
          </li>
        ))}
      </ul>
      {editing !== undefined && items[editing] && (
        <IngredientSheet
          key={editing}
          initial={items[editing]!}
          onSave={(saved) => {
            setItems((all) => all.map((x, j) => (j === editing ? { ...x, ...saved, product: saved.product } : x)));
            setEditing(undefined);
          }}
          onRemove={() => {
            setItems((all) => all.filter((_, j) => j !== editing));
            setEditing(undefined);
          }}
          onClose={() => setEditing(undefined)}
        />
      )}
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
      {proposal.instructions !== undefined && (
        <div className="field">
          <label htmlFor={`steps-${proposal.id}`}>{t('recipes.instructions')}</label>
          <textarea
            id={`steps-${proposal.id}`}
            className="note-text steps-text"
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <div className="field-hint">{t('ai.stepsReplace')}</div>
        </div>
      )}
      <p className="muted small">{t('ai.correctHintRecipe')}</p>
      <div className="sheet-actions">
        {items.length > 0 && <span className="muted">{t('ai.kcalInAll', { kcal: fmtNumber(kcal) })}</span>}
        <button className="btn btn-primary" disabled={!valid || saving} onClick={() => void add()}>
          {items.length ? t('ai.addIngredients', { n: items.length }) : t('ai.addSteps')}
        </button>
      </div>
    </div>
  );
}
