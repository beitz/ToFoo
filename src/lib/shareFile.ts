/**
 * Hand a file to the user: the Android share sheet where the browser can share files (to save it
 * or send it to an app), otherwise a download. A cancelled share rejects with an AbortError.
 */
export async function shareOrDownload(name: string, text: string, type = 'application/json'): Promise<'shared' | 'downloaded'> {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: name });
    return 'shared';
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
  return 'downloaded';
}
