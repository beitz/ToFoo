/**
 * Browser glue for saved chats: a recorder each chat screen keeps, and the export as a file.
 * The record format and everything pure is in ./chatRecord.ts.
 */
import { diag, diagEntries } from '../app/diagnostics';
import { newId } from '../lib/id';
import { shareOrDownload } from '../lib/shareFile';
import { repo } from '../storage/repo';
import { buildChatExport, CHAT_SCHEMA_VERSION, chatFileName, chatTitle, splitPhotos, type ChatEvent, type ChatKind, type ChatPhoto, type ChatRecord, type NewChatEvent } from './chatRecord';
import { mergeModelTokens, type ModelTokens } from './pricing';

type Store = { saveChat: (chat: ChatRecord, photos?: ChatPhoto[]) => Promise<void> };

/**
 * Writes one chat to the phone as it goes: the first event starts the record, every later event
 * and turn rewrites it (photos only once). Does nothing when saving chats is off.
 */
export class ChatRecorder {
  private rec: ChatRecord | undefined;
  private photosSaved = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly start: { kind: ChatKind; model: string; day?: string; features: Record<string, boolean> },
    readonly enabled: boolean,
    private readonly store: Store = repo,
  ) {}

  /** The saved chat's id, once something was recorded. */
  get id(): string | undefined {
    return this.rec?.id;
  }

  get photos(): number {
    return this.rec?.photos ?? 0;
  }

  private ensure(now: number): ChatRecord {
    this.rec ??= { id: newId(), schemaVersion: CHAT_SCHEMA_VERSION, ...this.start, startedAt: now, updatedAt: now, title: '', messages: [], events: [], photos: 0, tokens: {} };
    return this.rec;
  }

  event(e: NewChatEvent, now = Date.now()): void {
    if (!this.enabled) return;
    const rec = this.ensure(now);
    rec.events.push({ ...e, at: now } as ChatEvent);
    rec.title ||= chatTitle(rec.events);
    rec.updatedAt = now;
    this.flush([]);
  }

  /** Billed tokens of one API response; saved with the next event or turn. */
  usage(tokens: ModelTokens): void {
    if (this.rec) this.rec.tokens = mergeModelTokens(this.rec.tokens, tokens);
  }

  /** The API conversation after a turn, with the system prompt and tools it was sent with. */
  conversation(messages: readonly unknown[], setup: ChatRecord['setup'], now = Date.now()): void {
    if (!this.enabled) return;
    const rec = this.ensure(now);
    const split = splitPhotos(messages, rec.id);
    const fresh = split.photos.filter((p) => p.n > this.photosSaved);
    this.photosSaved = Math.max(this.photosSaved, ...split.photos.map((p) => p.n));
    rec.messages = split.messages;
    rec.photos = this.photosSaved;
    if (setup) rec.setup = setup;
    rec.updatedAt = now;
    this.flush(fresh);
  }

  /** Resolves once everything recorded so far is written. */
  saved(): Promise<void> {
    return this.queue;
  }

  private flush(photos: ChatPhoto[]): void {
    const rec = this.rec;
    if (!rec) return;
    // A copy as it is now: the record keeps changing while the write waits its turn.
    const copy = { ...rec, events: [...rec.events] };
    this.queue = this.queue
      .then(() => this.store.saveChat(copy, photos))
      .catch((e: unknown) => diag('chat.save', { msg: e instanceof Error ? e.message : String(e) }));
  }
}

/** Share a saved chat as one JSON file (photos only when asked), with the diagnostics log since it started. */
export async function exportChat(id: string, includePhotos: boolean, now = Date.now()): Promise<'shared' | 'downloaded' | 'missing'> {
  const rec = await repo.db.chats.get(id);
  if (!rec) return 'missing';
  const photos = includePhotos ? await repo.chatPhotos(id) : undefined;
  // A minute of slack: a lookup that failed just before the first message was recorded.
  const diagnostics = diagEntries()
    .filter((e) => e.t >= rec.startedAt - 60_000)
    .map((e) => ({ ...e, t: new Date(e.t).toISOString() }));
  const file = buildChatExport(rec, { ...(photos ? { photos } : {}), appVersion: __APP_VERSION__, exportedAt: now, diagnostics });
  return shareOrDownload(chatFileName(rec), JSON.stringify(file, null, 1));
}
