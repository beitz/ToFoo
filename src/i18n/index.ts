import { en, type MessageKey } from './en';

export type { MessageKey };

const languages: Record<string, Record<MessageKey, string>> = { en };
let current: Record<MessageKey, string> = en;

export function setLanguage(lang: string): void {
  current = languages[lang] ?? en;
}

/** Translate a key; `{name}` placeholders are replaced from `vars`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  let s: string = current[key] ?? en[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
