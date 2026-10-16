import { useEffect, useRef, useState } from 'react';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href, navigate } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { dayKey } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { emptyConversation, sendMessage, type AiModel, type Conversation, type TurnOutcome } from '../../ai/assistant';
import { classifyError, getAiSettings, makeCreate } from '../../ai/client';
import { prepareImage, type PreparedImage } from '../../ai/image';
import type { Proposal, ProposedItem } from '../../ai/tools';
import type { EntryConfidence } from '../../model/types';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { NumberInput } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { ConfidenceField } from '../log/ConfidenceField';
import { TimeField } from '../log/TimeField';
import { defaultTimeFor } from '../log/time';

type Bubble = { role: 'user'; text: string; previews: string[] } | { role: 'assistant'; text: string };

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
  const [proposal, setProposal] = useState<Proposal>();
  const [text, setText] = useState('');
  const [images, setImages] = useState<PreparedImage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey>();
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [create] = useState(() => makeCreate(apiKey));

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [bubbles.length, proposal, busy]);

  async function addPhotos(files: FileList | null) {
    if (!files) return;
    try {
      const prepared = await Promise.all([...files].map(prepareImage));
      setImages((imgs) => [...imgs, ...prepared]);
    } catch {
      setError('ai.error.photo');
    }
  }

  async function send() {
    const msg = { text, images };
    if (busy || (!msg.text.trim() && msg.images.length === 0)) return;
    const shownProposal = proposal;
    setBusy(true);
    setError(undefined);
    // A new message makes the shown proposal stale; the assistant answers with a new one if needed.
    setProposal(undefined);
    setBubbles((b) => [...b, { role: 'user', text: msg.text.trim(), previews: msg.images.map((i) => i.preview) }]);
    setText('');
    setImages([]);
    try {
      const ctx = { db: d.foods, index: d.searchIndex, boost: d.searchBoost };
      const r = await sendMessage(create, model, conversation, msg, ctx);
      setConversation(r.conversation);
      show(r.outcome);
    } catch (e) {
      // Nothing was added to the conversation: put the message back so a tap on Send retries it.
      setBubbles((b) => b.slice(0, -1));
      setText(msg.text);
      setImages(msg.images);
      setProposal(shownProposal);
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
    if (outcome.text) setBubbles((b) => [...b, { role: 'assistant', text: outcome.text }]);
    setProposal(outcome.kind === 'proposal' ? outcome.proposal : undefined);
  }

  return (
    <>
      <div className="chat" aria-live="polite">
        <div className="bubble bubble-assistant">{t('ai.intro')}</div>
        {bubbles.map((b, i) =>
          b.role === 'user' ? (
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
        {proposal && <ProposalCard key={bubbles.length} proposal={proposal} day={day} toast={toast} />}
        {busy && <div className="bubble bubble-assistant muted">{t('ai.thinking')}</div>}
        {error && (
          <div className="card notice-card" role="alert">
            <Icon name="alert" size={18} /> {t(error)}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="composer">
        {images.length > 0 && (
          <div className="composer-photos">
            {images.map((img, i) => (
              <div key={i} className="composer-photo">
                <img src={img.preview} alt={t('ai.photo')} />
                <button className="icon-btn" aria-label={t('ai.removePhoto')} onClick={() => setImages((all) => all.filter((_, j) => j !== i))}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="composer-row">
          <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void addPhotos(e.target.files).then(() => (e.target.value = ''))} />
          <button className="icon-btn composer-btn" aria-label={t('ai.addPhoto')} onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="camera" />
          </button>
          <textarea
            rows={1}
            value={text}
            placeholder={t('ai.placeholder')}
            aria-label={t('ai.placeholder')}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button className="icon-btn composer-btn composer-send" aria-label={t('ai.send')} onClick={() => void send()} disabled={busy || (!text.trim() && images.length === 0)}>
            <Icon name="send" />
          </button>
        </div>
      </div>
    </>
  );
}

/** The meal the assistant proposes: check, adjust grams, remove items, then log. */
function ProposalCard({ proposal, day, toast }: { proposal: Proposal; day: string; toast: ReturnType<typeof useToast> }) {
  const d = useData();
  const [items, setItems] = useState<Array<Omit<ProposedItem, 'grams'> & { grams: number | undefined }>>(proposal.items);
  const [confidence, setConfidence] = useState<EntryConfidence>(proposal.confidence);
  const [time, setTime] = useState(() => defaultTimeFor(day, d.today));
  const [saving, setSaving] = useState(false);
  const valid = items.length > 0 && items.every((i) => i.grams && i.grams > 0);
  const kcal = items.reduce((sum, i) => {
    const v = i.food.per100.ENERCC;
    return typeof v === 'number' && i.grams ? sum + (v * i.grams) / 100 : sum;
  }, 0);

  async function log() {
    if (!valid || saving) return;
    setSaving(true);
    const ids: string[] = [];
    for (const it of items) {
      const entry = await repo.addLog({
        kind: 'food',
        ref: { source: 'BLS', version: d.foods.version, code: it.food.code },
        grams: it.grams!,
        preparation: it.preparation,
        time,
        day: dayKey(new Date(time)),
        confidence,
        label: it.food.nameEn,
      });
      ids.push(entry.id);
    }
    toast(t('ai.logged'), async () => {
      for (const id of ids) await repo.deleteLog(id);
    });
    navigate();
  }

  return (
    <div className="card proposal">
      <strong>{proposal.summary || t('ai.proposal')}</strong>
      <ul className="plain-list">
        {items.map((it, i) => (
          <li key={`${it.food.code}-${i}`} className="proposal-item">
            <div className="proposal-name">
              <a href={href('food', it.food.code)}>{it.food.nameEn}</a>
              <span className="muted small block">{it.note || it.food.nameDe}</span>
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
