import { diag } from '../app/diagnostics';

/**
 * Hand a file to the user: the Android share sheet where the browser can share files (to save it
 * or send it to an app), otherwise a download. A cancelled share rejects with an AbortError; a
 * share the browser refuses (e.g. NotAllowedError) falls back to a download, so the file still
 * reaches the user, and the refusal goes into the diagnostics log.
 */
export async function shareOrDownload(name: string, text: string, type = 'application/json'): Promise<'shared' | 'downloaded'> {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') throw e;
      diag('share.failed', { file: name, bytes: text.length, error: errorText(e) });
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // Revoked later: some browsers start reading the file only after the click has returned.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'downloaded';
}

/** "NotAllowedError: Permission denied", for messages and the diagnostics log. */
export function errorText(e: unknown): string {
  if (e instanceof Error) return e.name && e.name !== 'Error' ? `${e.name}: ${e.message}` : e.message;
  return String(e);
}
