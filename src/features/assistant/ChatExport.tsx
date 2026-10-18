import { useState } from 'react';
import { useToast } from '../../app/toast';
import { href } from '../../app/router';
import { t } from '../../i18n';
import { exportChat, type ChatRecorder } from '../../ai/chatStore';
import { Icon } from '../../ui/Icon';

/** Share a saved chat as a file and say how it went; a cancelled share says nothing. */
export async function shareChat(id: string, photos: boolean, toast: ReturnType<typeof useToast>): Promise<void> {
  try {
    const r = await exportChat(id, photos);
    toast(t(r === 'missing' ? 'chats.missing' : r === 'shared' ? 'chats.shared' : 'chats.downloaded'));
  } catch (e) {
    if ((e as Error).name !== 'AbortError') toast(t('chats.exportFailed'));
  }
}

/** Under the chat: share this chat as one file (e.g. to report a wrong result), photos optional. */
export function ChatExport({ recorder }: { recorder: ChatRecorder }) {
  const toast = useToast();
  const [photos, setPhotos] = useState(false);
  const [busy, setBusy] = useState(false);

  async function share() {
    setBusy(true);
    try {
      // Everything up to the latest answer is written before the file is made.
      await recorder.saved();
      if (recorder.id) await shareChat(recorder.id, photos, toast);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="chat-export">
      <button className="btn btn-small btn-ghost" disabled={busy} onClick={() => void share()}>
        <Icon name="share" size={18} /> {t('chats.shareThis')}
      </button>
      {recorder.photos > 0 && (
        <label className="chat-export-photos small">
          <input type="checkbox" checked={photos} onChange={(e) => setPhotos(e.target.checked)} /> {t('chats.withPhotos', { n: recorder.photos })}
        </label>
      )}
      <a className="small" href={href('settings', 'chats')}>
        {t('chats.all')}
      </a>
    </div>
  );
}
