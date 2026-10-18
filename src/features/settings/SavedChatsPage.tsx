import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useData } from '../../app/data';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t, type MessageKey } from '../../i18n';
import { chatSize, type ChatKind, type ChatRecord } from '../../ai/chatRecord';
import { formatDay, formatTime, dayKey } from '../../lib/dates';
import { fmtBytes } from '../../lib/format';
import { isOn } from '../../settings/features';
import { repo } from '../../storage/repo';
import { Toggle } from '../../ui/controls';
import { Icon } from '../../ui/Icon';
import { shareChat } from '../assistant/ChatExport';
import { SubPage } from './ProfilePage';

const KIND_LABEL: Record<ChatKind, MessageKey> = { log: 'chats.kind.log', recipe: 'chats.kind.recipe', insights: 'chats.kind.insights' };

/** Saved assistant chats: share one as a file, or delete (with undo). Route: #/settings/chats. */
export function SavedChatsPage() {
  const d = useData();
  const toast = useToast();
  const chats = useLiveQuery(() => repo.db.chats.orderBy('updatedAt').reverse().toArray(), []);
  const photoSizes = useLiveQuery(() => repo.chatPhotoSizes(), [chats?.length]);
  const [photos, setPhotos] = useState(false);
  const on = isOn(d.settings.features, 'saveChats');

  async function remove(ids: string[], message: string) {
    const old = await repo.deleteChats(ids);
    toast(message, () => void repo.restoreChats(old));
  }

  const total = chats?.reduce((n, c) => n + chatSize(c, photoSizes?.get(c.id)), 0) ?? 0;

  return (
    <SubPage title={t('chats.title')} back={href('settings', 'assistant')}>
      <div className="card">
        <Toggle checked={on} onChange={(v) => repo.updateSettings({ features: { ...d.settings.features, saveChats: v } })} label={t('chats.enable')} />
        <p className="muted small">{t('chats.intro')}</p>
      </div>
      {chats === undefined ? (
        <p className="muted">{t('common.loading')}</p>
      ) : chats.length === 0 ? (
        <p className="muted">{t('chats.none')}</p>
      ) : (
        <>
          <div className="row-between chats-head">
            <label className="radio-row small">
              <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> {t('chats.includePhotos')}
            </label>
            <span className="muted small">{t('chats.total', { n: chats.length, size: fmtBytes(total) })}</span>
          </div>
          <ul className="chat-list">
            {chats.map((c) => (
              <ChatRow key={c.id} chat={c} today={d.today} size={chatSize(c, photoSizes?.get(c.id))} onShare={() => void shareChat(c.id, photos, toast)} onDelete={() => void remove([c.id], t('chats.deleted'))} />
            ))}
          </ul>
          <button className="btn btn-danger-ghost btn-block" onClick={() => void remove(chats.map((c) => c.id), t('chats.deletedAll', { n: chats.length }))}>
            <Icon name="trash" size={18} /> {t('chats.deleteAll')}
          </button>
        </>
      )}
    </SubPage>
  );
}

function ChatRow({ chat, today, size, onShare, onDelete }: { chat: ChatRecord; today: string; size: number; onShare: () => void; onDelete: () => void }) {
  const counts = {
    messages: chat.events.filter((e) => e.type === 'user').length,
    cards: chat.events.reduce((n, e) => n + (e.type === 'cards' ? e.cards.length : 0), 0),
    saved: chat.events.filter((e) => e.type === 'saved').length - chat.events.filter((e) => e.type === 'undone').length,
    errors: chat.events.filter((e) => e.type === 'error').length,
  };
  const parts = [
    t('chats.messages', { n: counts.messages }),
    ...(counts.cards ? [t('chats.cards', { n: counts.cards, saved: Math.max(0, counts.saved) })] : []),
    ...(chat.photos ? [t('chats.photos', { n: chat.photos })] : []),
    ...(counts.errors ? [t('chats.errors', { n: counts.errors })] : []),
    fmtBytes(size),
  ];
  return (
    <li>
      <div className="card chat-row">
        <div className="row-between">
          <strong>{t(KIND_LABEL[chat.kind])}</strong>
          <span className="muted small">
            {formatDay(dayKey(new Date(chat.startedAt)), today)}, {formatTime(chat.startedAt)}
          </span>
        </div>
        {chat.title && <p className="chat-row-title">{chat.title}</p>}
        <p className="muted small">{parts.join(' · ')}</p>
        <div className="row-between">
          <button className="btn btn-small btn-secondary" onClick={onShare}>
            <Icon name="share" size={18} /> {t('chats.share')}
          </button>
          <button className="icon-btn" aria-label={t('chats.delete')} onClick={onDelete}>
            <Icon name="trash" size={18} />
          </button>
        </div>
      </div>
    </li>
  );
}
