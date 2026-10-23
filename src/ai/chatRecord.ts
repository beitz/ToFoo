/**
 * Saved assistant chats (docs/SPEC.md, "Saved chats"): what was said, what the assistant looked up
 * and proposed, and what the user logged, kept on the phone so a chat can be exported as one file,
 * e.g. to report a wrong result. Pure: storage is in src/storage, the recorder in ./chatStore.ts.
 *
 * Photos are kept apart from the messages (each is written once, and the export leaves them out
 * unless asked); in the stored messages an image block is replaced by `{ type: 'image', photo: n }`,
 * n counting the chat's photos from 1 in the order they were sent.
 */
import type { Food } from '../foods/foodDb';
import type { Product } from '../storage/types';
import type { Conversation } from './assistant';
import type { ProposedItem } from './tools';
import { fmtLocalDateTime } from './photoTime';
import type { ModelTokens } from './pricing';

/** 2: `resume` added, so a chat can be reopened exactly where it was left (older chats are rebuilt from their events). */
export const CHAT_SCHEMA_VERSION = 2;
export const CHAT_EXPORT_FORMAT = 'tofoo-chat';
export const CHAT_EXPORT_VERSION = 1;

/** Meal logging (#/assistant), the recipe editor's assistant, or Insights. */
export type ChatKind = 'log' | 'recipe' | 'insights';

/** Something the user saw or did in the chat, in order, alongside the API messages. */
export type ChatEvent =
  | { at: number; type: 'user'; text: string; photos: string[]; dictated?: boolean; audio?: number[] }
  | { at: number; type: 'assistant'; text: string; checks?: unknown[] }
  | { at: number; type: 'cards'; text: string; cards: unknown[] }
  | { at: number; type: 'saved'; card: string; saved: unknown }
  | { at: number; type: 'undone'; card: string }
  | { at: number; type: 'error'; reason: string; detail?: string };

/** Spreads to the event types without `at`, so callers can pass one variant. */
export type NewChatEvent = ChatEvent extends infer E ? (E extends ChatEvent ? Omit<E, 'at'> : never) : never;

export interface ChatRecord {
  id: string;
  schemaVersion: number;
  kind: ChatKind;
  startedAt: number;
  updatedAt: number;
  model: string;
  /** Meal logging: the day the chat was opened for. */
  day?: string;
  /** The first words of the first message, for the list of saved chats. */
  title: string;
  /** The optional features that were on when the chat started (they decide the tools and prompt). */
  features: Record<string, boolean>;
  /** The system prompt and tools of the latest request. */
  setup?: { system: string; tools: unknown[] };
  /** The API conversation as sent, photos replaced by their number. */
  messages: unknown[];
  events: ChatEvent[];
  /** Photos stored for this chat. */
  photos: number;
  /** Voice recordings stored for this chat (from 2026-10-22). */
  audio?: number;
  /** Billed tokens per model, as in the usage line. */
  tokens: ModelTokens;
  /** What reopening the chat needs besides the messages and events (meal chats, from version 2). */
  resume?: ChatResume;
}

/** The rest of the conversation state after the latest turn, and the products looked up in the chat. */
export interface ChatResume {
  conversation: Omit<Conversation, 'messages'>;
  products: Product[];
}

export interface ChatPhoto {
  /** `${chatId}:${n}`. */
  id: string;
  chatId: string;
  n: number;
  mediaType: string;
  /** Base64 without the data-URL prefix. */
  data: string;
}

/** A voice recording the user spoke a message in, kept with the chat so it can be played again. */
export interface AudioClip {
  /** The audio file (Chrome records Opus in WebM); an ArrayBuffer, which IndexedDB stores everywhere. */
  data: ArrayBuffer;
  mediaType: string;
  /** Length in milliseconds. */
  ms: number;
}

export interface ChatAudio extends AudioClip {
  /** `${chatId}:a${n}`. */
  id: string;
  chatId: string;
  n: number;
}

type Block = Record<string, unknown>;
const isBlock = (b: unknown): b is Block => typeof b === 'object' && b !== null;

/** Map every block of every message's content, in order (tool results can hold blocks too). */
function mapBlocks(messages: readonly unknown[], fn: (b: Block) => Block): unknown[] {
  const mapList = (list: unknown[]): unknown[] =>
    list.map((b) => {
      if (!isBlock(b)) return b;
      const out = fn(b);
      return Array.isArray(out.content) ? { ...out, content: mapList(out.content) } : out;
    });
  return messages.map((m) => (isBlock(m) && Array.isArray(m.content) ? { ...m, content: mapList(m.content) } : m));
}

/** The number in the label the app puts before each photo ("Photo 3: taken …"). */
export function photoNumber(label: string): number | undefined {
  const m = /^Photo (\d+):/.exec(label);
  return m ? Number(m[1]) : undefined;
}

/**
 * Replace the photos in API messages by their number; returns the photos too. A photo gets the
 * number of its label, so numbers stay right when earlier photos were taken out of the chat
 * (retirePhotos); one without a label gets the next free number. Already numbered photos are kept
 * as they are, so the conversation can be split again after every turn.
 */
export function splitPhotos(messages: readonly unknown[], chatId: string): { messages: unknown[]; photos: ChatPhoto[] } {
  const photos: ChatPhoto[] = [];
  let last = 0;
  let label: number | undefined;
  const out = mapBlocks(messages, (b) => {
    if (b.type !== 'image') {
      label = b.type === 'text' && typeof b.text === 'string' ? photoNumber(b.text) : undefined;
      return b;
    }
    const n = typeof b.photo === 'number' ? b.photo : (label ?? last + 1);
    label = undefined;
    last = Math.max(last, n);
    const src = b.source;
    if (isBlock(src) && src.type === 'base64' && typeof src.data === 'string') {
      photos.push({ id: `${chatId}:${n}`, chatId, n, mediaType: String(src.media_type), data: src.data });
      return { type: 'image', photo: n };
    }
    return b;
  });
  return { messages: out, photos };
}

/**
 * Put the photos back into stored messages. A photo that is missing stays a number, or becomes
 * the text `missing` (a request to the API cannot carry a numbered photo).
 */
export function joinPhotos(messages: readonly unknown[], photos: readonly ChatPhoto[], missing?: string): unknown[] {
  const byN = new Map(photos.map((p) => [p.n, p]));
  return mapBlocks(messages, (b) => {
    if (b.type !== 'image' || typeof b.photo !== 'number') return b;
    const p = byN.get(b.photo);
    if (p) return { type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data } };
    return missing === undefined ? b : { type: 'text', text: missing };
  });
}

/** Thinking signatures are long opaque strings that tell a reader nothing; the thinking text stays. */
function dropSignatures(messages: readonly unknown[]): unknown[] {
  return mapBlocks(messages, (b) => {
    if (b.type === 'thinking' && 'signature' in b) return { ...b, signature: '(left out)' };
    if (b.type === 'redacted_thinking' && 'data' in b) return { ...b, data: '(left out)' };
    return b;
  });
}

export interface ItemLike {
  food: Pick<Food, 'code' | 'nameEn'>;
  grams: number | undefined;
  preparation: string;
  note?: string;
  pieces?: ProposedItem['pieces'];
  product?: Pick<Product, 'id' | 'name' | 'brand' | 'match'>;
}

const isFood = (it: unknown): it is ItemLike => typeof it === 'object' && it !== null && 'food' in it;

/** A proposed food as it goes into a saved chat: what was chosen, not the food's whole nutrient table. */
export function itemSummary(it: ItemLike) {
  const p = it.product;
  return {
    code: it.food.code,
    name: it.food.nameEn,
    grams: it.grams,
    preparation: it.preparation,
    ...(it.note ? { note: it.note } : {}),
    ...(it.pieces ? { pieces: it.pieces } : {}),
    ...(p ? { product: { id: p.id, name: p.name, ...(p.brand ? { brand: p.brand } : {}), ...(p.match ? { microsFrom: p.match.code } : {}) } } : {}),
  };
}

/** Times as local "Sun 2026-10-18 10:52", the way the assistant reads and writes them. */
export function localTimes(o: object): Record<string, unknown> {
  const out: Record<string, unknown> = { ...o };
  for (const k of ['time', 'start', 'end']) if (typeof out[k] === 'number') out[k] = fmtLocalDateTime(out[k] as number);
  return out;
}

/** A proposal card as saved: foods summarized, times readable, everything else as it is. */
export function cardSummary(card: object): Record<string, unknown> {
  const c = localTimes(card);
  // Foods are cut down to what was chosen; other lists (a shopping card's things) stay as they are.
  const out = Array.isArray(c.items) ? { ...c, items: c.items.map((it) => (isFood(it) ? itemSummary(it) : it)) } : c;
  // Changes to a pot or a serving carry whole foods too (batch cooking cards).
  return Array.isArray(out.changes) ? { ...out, changes: out.changes.map((ch: { item?: ItemLike }) => (ch.item ? { ...ch, item: itemSummary(ch.item) } : ch)) } : out;
}

/** Title for the list: the first words of the first message, or what it held. */
export function chatTitle(events: readonly ChatEvent[]): string {
  const first = events.find((e): e is Extract<ChatEvent, { type: 'user' }> => e.type === 'user');
  if (!first) return '';
  const text = first.text.replace(/\s+/g, ' ').trim();
  if (text) return text.length > 80 ? `${text.slice(0, 79)}…` : text;
  return first.photos.length ? `(${first.photos.length} photo${first.photos.length === 1 ? '' : 's'})` : '';
}

/** Rough size of a saved chat in bytes (JSON text), for the list. */
export function chatSize(rec: ChatRecord, mediaBytes = 0): number {
  return JSON.stringify(rec).length + mediaBytes;
}

/** The export file: one JSON object a person or Claude can read, and that can be replayed against the API. */
export function buildChatExport(
  rec: ChatRecord,
  o: { photos?: readonly ChatPhoto[]; appVersion: string; exportedAt: number; diagnostics?: readonly unknown[] },
) {
  const messages = dropSignatures(o.photos ? joinPhotos(rec.messages, o.photos) : rec.messages);
  return {
    format: CHAT_EXPORT_FORMAT,
    version: CHAT_EXPORT_VERSION,
    app: `ToFoo ${o.appVersion}`,
    exportedAt: new Date(o.exportedAt).toISOString(),
    photos: o.photos ? 'included' : rec.photos ? `left out (${rec.photos}); each shows as { "type": "image", "photo": n }` : 'none',
    chat: {
      id: rec.id,
      kind: rec.kind,
      model: rec.model,
      startedAt: new Date(rec.startedAt).toISOString(),
      updatedAt: new Date(rec.updatedAt).toISOString(),
      ...(rec.day ? { day: rec.day } : {}),
      features: rec.features,
      tokens: rec.tokens,
    },
    /** What the user saw and did: messages, cards, what they saved or undid, errors. */
    events: rec.events.map((e) => ({ ...e, at: new Date(e.at).toISOString() })),
    /** The conversation with the API: every message, tool call and tool result. */
    messages,
    ...(rec.setup ? { system: rec.setup.system, tools: rec.setup.tools } : {}),
    ...(o.diagnostics?.length ? { diagnostics: o.diagnostics } : {}),
  };
}

/** e.g. tofoo-chat-2026-10-18-1052-log.json (local time). */
export function chatFileName(rec: Pick<ChatRecord, 'startedAt' | 'kind'>): string {
  const d = new Date(rec.startedAt);
  const p = (n: number) => String(n).padStart(2, '0');
  return `tofoo-chat-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}-${rec.kind}.json`;
}
