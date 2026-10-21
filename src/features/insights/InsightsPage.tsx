import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import type { AiModel } from '../../ai/assistant';
import { describeAiError, getAiSettings, logAiError, makeCreate, saveUsage } from '../../ai/client';
import { ChatRecorder } from '../../ai/chatStore';
import { INSIGHT_SYSTEM, INSIGHT_TOOLS } from '../../ai/insightsPrompt';
import { askInsights, fmtChance, fmtMeasure, insightNote, type Check, type InsightConversation } from '../../ai/insights';
import { mergeModelTokens, type ModelTokens } from '../../ai/pricing';
import { JOURNAL_TRANSCRIBE_PROMPT } from '../../ai/transcribe';
import { addDays, formatDay } from '../../lib/dates';
import { fmtNumber } from '../../lib/format';
import { buildInsightData, MEASURE_BY_ID, overview, type InsightData, type Stats } from '../../logic/insights';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Segmented } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { appendText, useDictation } from '../assistant/useDictation';
import { RecordingTime } from '../assistant/RecordingTime';
import { UsageLine } from '../assistant/UsageLine';
import { ChatExport } from '../assistant/ChatExport';
import { VoiceFailed } from '../assistant/VoiceFailed';
import { useJournal } from '../journal/useJournal';
import { describeConditions, verdict } from './describe';
import { BackButton } from '../../ui/BackButton';

type Period = '2w' | '4w' | '3m' | 'all';
const PERIOD_DAYS: Record<Exclude<Period, 'all'>, number> = { '2w': 14, '4w': 28, '3m': 91 };
/** Below this, the screen says plainly that there is little to go on (a few weeks, per docs/SPEC.md). */
const THIN_FOOD_DAYS = 14;
const THIN_JOURNAL_ENTRIES = 5;

type Bubble = { role: 'user'; text: string } | { role: 'assistant'; text: string; checks: Check[] };
interface ChatState {
  period: Period;
  conversation: InsightConversation;
  bubbles: Bubble[];
  tokens: ModelTokens;
  /** Saves the chat on the phone (Settings → AI assistant → Saved chats). */
  recorder: ChatRecorder;
}
/** The open chat, kept while the user looks at a day in the diary and comes back. */
let lastChat: ChatState | undefined;

const ERROR_TEXT: Record<string, MessageKey> = {
  auth: 'ai.error.auth',
  rateLimit: 'ai.error.rateLimit',
  overloaded: 'ai.error.overloaded',
  network: 'ai.error.network',
  webSearchOff: 'ai.error.other',
  rejected: 'ai.error.rejected',
  app: 'ai.error.app',
  other: 'ai.error.other',
  refusal: 'insights.error.refusal',
  tooLong: 'insights.error.tooLong',
  tooManySteps: 'insights.error.tooManySteps',
};

/** Look for patterns across journal, food, sleep, activity and water (docs/SPEC.md, "Insights"). Route: #/insights. */
export function InsightsPage() {
  const d = useData();
  const on = isOn(d.settings.features, 'aiAssistant') && isOn(d.settings.features, 'insights');
  const [ai, setAi] = useState<{ apiKey: string; model: AiModel }>();
  useEffect(() => {
    void getAiSettings().then(setAi);
  }, []);
  const [resetKey, setResetKey] = useState(0);

  let body;
  if (!on || (ai && !ai.apiKey)) {
    body = (
      <div className="card">
        <p>{t(on ? 'ai.needsKey' : 'insights.off')}</p>
        <a className="btn btn-primary" href={href('settings', 'assistant')}>
          {t('ai.openSettings')}
        </a>
      </div>
    );
  } else if (ai) body = <Chat key={resetKey} apiKey={ai.apiKey} model={ai.model} />;
  else body = <p className="muted">{t('common.loading')}</p>;

  return (
    <section className="assistant-page">
      <header className="page-head row-between">
        <BackButton to={['diary']} />
        <h1>{t('insights.title')}</h1>
        <button
          className="btn btn-small btn-ghost"
          disabled={!on}
          onClick={() => {
            lastChat = undefined;
            setResetKey((k) => k + 1);
          }}
        >
          {t('insights.new')}
        </button>
      </header>
      {body}
    </section>
  );
}

function useInsightData(): InsightData | undefined {
  const d = useData();
  const f = d.settings.features;
  const journal = useJournal();
  const sleep = useLiveQuery(() => repo.db.sleep.toArray(), []);
  const activities = useLiveQuery(() => repo.db.activities.toArray(), []);
  const water = useLiveQuery(() => repo.db.water.toArray(), []);
  return useMemo(() => {
    if (!journal || !sleep || !activities || !water) return undefined;
    // Trackers the user turned off stay out of the analysis.
    return buildInsightData({
      days: d.modelDays,
      daily: d.model.daily,
      dayStatus: d.model.dayStatus,
      entries: d.modelEntries,
      journal: isOn(f, 'journal') ? journal : [],
      sleep: isOn(f, 'sleep') ? sleep : [],
      activities: isOn(f, 'activity') ? activities : [],
      water: isOn(f, 'water') ? water : [],
      mealWindowMinutes: d.settings.mealWindowMinutes,
      today: d.today,
    });
  }, [d.modelDays, d.model, d.modelEntries, d.settings.mealWindowMinutes, d.today, f, journal, sleep, activities, water]);
}

function Chat({ apiKey, model }: { apiKey: string; model: AiModel }) {
  const d = useData();
  const data = useInsightData();
  const [state, setState] = useState<ChatState>(
    () =>
      lastChat ?? {
        period: '3m',
        conversation: { messages: [] },
        bubbles: [],
        tokens: {},
        recorder: new ChatRecorder({ kind: 'insights', model, features: d.settings.features }, isOn(d.settings.features, 'saveChats')),
      },
  );
  const { recorder } = state;
  useEffect(() => {
    lastChat = state.bubbles.length ? state : undefined;
  }, [state]);
  const [turnTokens, setTurnTokens] = useState<ModelTokens>({});
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: MessageKey; detail?: string }>();
  const [create] = useState(() => makeCreate(apiKey));
  const endRef = useRef<HTMLDivElement>(null);
  const dictation = useDictation({ onText: (added, continued) => setText((old) => appendText(old, added, continued)), onError: (key) => setError({ key }), prompt: JOURNAL_TRANSCRIBE_PROMPT });

  useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: 'end', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [state.bubbles.length, busy]);

  const from = data ? (state.period === 'all' ? data.first : addDays(d.today, -(PERIOD_DAYS[state.period] - 1))) : d.today;
  const ov = data ? overview(data, from, d.today) : undefined;
  const started = state.bubbles.length > 0;
  const f = d.settings.features;

  async function send(question: string) {
    if (busy || !data || !ov || !question.trim()) return;
    setBusy(true);
    setError(undefined);
    setText('');
    setTurnTokens({});
    const before = state;
    setState((s) => ({ ...s, bubbles: [...s.bubbles, { role: 'user', text: question.trim() }] }));
    recorder.event({ type: 'user', text: question.trim(), photos: [] });
    const onUsage = (tokens: ModelTokens) => {
      setState((s) => ({ ...s, tokens: mergeModelTokens(s.tokens, tokens) }));
      recorder.usage(tokens);
      setTurnTokens((c) => mergeModelTokens(c, tokens));
      void saveUsage(tokens);
    };
    try {
      const note = insightNote(Date.now(), ov, before.conversation.messages.length === 0);
      const r = await askInsights(create, model, before.conversation, { text: question, appNote: note }, data, onUsage);
      recorder.conversation(r.conversation.messages, { system: INSIGHT_SYSTEM, tools: INSIGHT_TOOLS });
      if (r.outcome.kind === 'error') {
        const reason = r.outcome.reason;
        recorder.event({ type: 'error', reason });
        logAiError('insights', model, { kind: reason });
        setState((s) => ({ ...s, conversation: r.conversation, bubbles: s.bubbles.slice(0, -1) }));
        setText(question);
        setError({ key: ERROR_TEXT[reason]! });
      } else {
        const reply = r.outcome;
        recorder.event({ type: 'assistant', text: reply.text, checks: reply.checks });
        setState((s) => ({ ...s, conversation: r.conversation, bubbles: [...s.bubbles, { role: 'assistant', text: reply.text, checks: reply.checks }] }));
      }
    } catch (e) {
      // Nothing was added to the conversation: put the question back so Ask retries it.
      setState((s) => ({ ...s, bubbles: s.bubbles.slice(0, -1) }));
      setText(question);
      const failure = await describeAiError(e);
      recorder.event({ type: 'error', reason: failure.kind, detail: failure.detail });
      logAiError('insights', model, failure, e);
      setError({ key: ERROR_TEXT[failure.kind]!, detail: failure.detail });
    } finally {
      setBusy(false);
    }
  }

  const thin = ov && (ov.foodComplete < THIN_FOOD_DAYS || (isOn(f, 'journal') && ov.journalEntries < THIN_JOURNAL_ENTRIES));
  const { recording, transcribing } = dictation;

  return (
    <>
      <div className="chat" aria-live="polite">
        <div className="bubble bubble-assistant">{t('insights.intro')}</div>
        {!started && (
          <div className="card insights-start">
            <Segmented<Period>
              label={t('insights.period')}
              value={state.period}
              onChange={(period) => setState((s) => ({ ...s, period }))}
              options={[
                { value: '2w', label: t('insights.p2w') },
                { value: '4w', label: t('insights.p4w') },
                { value: '3m', label: t('insights.p3m') },
                { value: 'all', label: t('insights.pAll') },
              ]}
            />
            {ov && (
              <>
                <p className="small">
                  <strong>{t('insights.ovRange', { from: formatDay(ov.from, d.today), to: formatDay(ov.to, d.today) })}</strong>
                </p>
                <ul className="plain-list small insights-overview">
                  <li>{t('insights.ovFood', { n: ov.foodComplete, days: ov.days })}</li>
                  {isOn(f, 'journal') && <li>{t('insights.ovJournal', { n: ov.journalEntries })}</li>}
                  {isOn(f, 'sleep') && <li>{t('insights.ovNights', { n: ov.nights })}</li>}
                  {isOn(f, 'activity') && <li>{t('insights.ovActivity', { n: ov.activityDays })}</li>}
                  {isOn(f, 'water') && <li>{t('insights.ovWater', { n: ov.waterDays })}</li>}
                </ul>
                {thin && <p className="muted small">{t('insights.thin')}</p>}
              </>
            )}
            <button className="btn btn-primary" disabled={busy || !data} onClick={() => void send(t('insights.lookPrompt'))}>
              <Icon name="insights" size={18} /> {t('insights.open')}
            </button>
          </div>
        )}
        {state.bubbles.map((b, i) =>
          b.role === 'user' ? (
            <div key={i} className="bubble bubble-user">
              <p>{b.text}</p>
            </div>
          ) : (
            <div key={i} className="insights-answer">
              <div className="bubble bubble-assistant">{b.text}</div>
              {b.checks.length > 0 && <Checks checks={b.checks} />}
            </div>
          ),
        )}
        {busy && <div className="bubble bubble-assistant muted">{t('insights.thinking')}</div>}
        {error && (
          <div className="card notice-card" role="alert">
            <Icon name="alert" size={18} />
            <div>
              <p>{t(error.key)}</p>
              {error.detail && <p className="small error-detail">{t('insights.errorDetail', { detail: error.detail })}</p>}
            </div>
          </div>
        )}
        <UsageLine chat={state.tokens} turn={turnTokens} model={model} />
        <p className="muted small disclaimer">{t('insights.disclaimer')}</p>
        {recorder.enabled && started && !busy && <ChatExport recorder={recorder} />}
        <div ref={endRef} />
      </div>

      <div className="composer">
        {dictation.startedAt !== undefined ? (
          <p className="composer-note voice-status small" role="status">
            <span className="rec-dot" aria-hidden="true" /> <RecordingTime since={dictation.startedAt} />
          </p>
        ) : transcribing ? (
          <p className="composer-note muted small" role="status">
            {t('voice.transcribing')}
          </p>
        ) : dictation.failed ? (
          <VoiceFailed onRetry={dictation.retry} onDrop={dictation.drop} />
        ) : null}
        <div className="composer-row">
          {dictation.available && (
            <button
              className={`icon-btn composer-btn${recording ? ' composer-recording' : ''}`}
              aria-label={t(recording ? 'voice.stop' : 'voice.record')}
              aria-pressed={recording}
              onClick={() => void dictation.toggle()}
              disabled={transcribing}
            >
              <Icon name={recording ? 'stop' : 'mic'} filled={recording} />
            </button>
          )}
          <textarea rows={1} value={text} placeholder={t('insights.placeholder')} aria-label={t('insights.placeholder')} onChange={(e) => setText(e.target.value)} enterKeyHint="enter" />
          <button className="icon-btn composer-btn composer-send" aria-label={t('insights.send')} onClick={() => void send(text)} disabled={busy || dictation.busy || !text.trim() || !data}>
            <Icon name="send" />
          </button>
        </div>
      </div>
    </>
  );
}

const pctText = (yes: number, known: number) => (known ? ` (${Math.round((100 * yes) / known)} %)` : '');

/** The comparisons behind an answer, with the app's own numbers and the days they rest on. */
function Checks({ checks }: { checks: Check[] }) {
  return (
    <details className="card insights-checks">
      <summary>{t('insights.checks', { n: checks.length })}</summary>
      <ul className="plain-list">
        {checks.map((c, i) => (
          <li key={i} className="insights-check">
            {c.kind === 'count' ? <CountCheck check={c} /> : <CompareCheck check={c} />}
          </li>
        ))}
      </ul>
    </details>
  );
}

function CountCheck({ check }: { check: Extract<Check, { kind: 'count' }> }) {
  const d = useData();
  const r = check.result;
  const hasGroup = check.group.length > 0;
  const leftOut = r.days - r.group.known - r.others.known;
  return (
    <>
      <p className="insights-check-title">
        {hasGroup ? describeConditions(check.group) : t('insights.allDays')} → {describeConditions(check.outcome)}
      </p>
      <p className="small">
        {hasGroup ? t('insights.countGroup', { yes: r.group.yes, known: r.group.known, pct: pctText(r.group.yes, r.group.known) }) : t('insights.countAll', { yes: r.group.yes, known: r.group.known, pct: pctText(r.group.yes, r.group.known) })}
        {hasGroup && (
          <>
            <br />
            {t('insights.countOthers', { yes: r.others.yes, known: r.others.known, pct: pctText(r.others.yes, r.others.known) })}
          </>
        )}
      </p>
      {r.chance !== undefined && (
        <p className="small" title={t('insights.chanceHelp')}>
          {t('insights.chance', { p: fmtChance(r.chance), verdict: verdict(r.chance) })}
        </p>
      )}
      {leftOut > 0 && <p className="muted small">{t('insights.leftOut', { n: leftOut })}</p>}
      {r.groupDays.length > 0 && (
        <ul className="plain-list row wrap insights-days">
          {r.groupDays.map((g) => {
            const outcome = t(g.outcome === null ? 'insights.dayUnknown' : g.outcome ? 'insights.dayYes' : 'insights.dayNo');
            return (
              <li key={g.day}>
                <a className={`status-chip insights-day${g.outcome ? ' insights-day-yes' : ''}`} href={href('diary', g.day)} aria-label={t('insights.showDay', { day: formatDay(g.day, d.today), outcome })}>
                  {/* The mark carries the meaning, not the colour. */}
                  <span aria-hidden="true">{g.outcome === null ? '?' : g.outcome ? '✓' : '–'}</span> {formatDay(g.day, d.today)}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function statsShort(id: string, s: Stats | undefined): string {
  return s ? fmtMeasure(id, s.mean) : t('insights.noData');
}

function CompareCheck({ check }: { check: Extract<Check, { kind: 'compare' }> }) {
  const hasGroup = check.group.length > 0;
  return (
    <>
      <p className="insights-check-title">{describeConditions(check.group)}</p>
      <ul className="plain-list small">
        {check.result.measures.map((m) => {
          const name = MEASURE_BY_ID.get(m.measure)?.name ?? m.measure;
          const minimum = (m.group?.minimumDays ?? 0) + (m.others?.minimumDays ?? 0);
          return (
            <li key={m.measure}>
              <strong>{name}</strong>:{' '}
              {hasGroup ? (
                <>
                  {t('insights.measureGroup', { v: statsShort(m.measure, m.group), n: m.group?.n ?? 0 })} · {t('insights.measureOthers', { v: statsShort(m.measure, m.others), n: m.others?.n ?? 0 })}
                  {m.chance !== undefined && (
                    <>
                      <br />
                      <span title={t('insights.chanceHelp')}>{t('insights.chance', { p: fmtChance(m.chance), verdict: verdict(m.chance) })}</span>
                    </>
                  )}
                </>
              ) : m.group ? (
                t('insights.measureAll', { v: fmtMeasure(m.measure, m.group.mean), min: fmtMeasure(m.measure, m.group.min), max: fmtMeasure(m.measure, m.group.max), n: fmtNumber(m.group.n) })
              ) : (
                t('insights.noData')
              )}
              {minimum > 0 && <span className="muted"> · {t('insights.minimum', { n: minimum })}</span>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
