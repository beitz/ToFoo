import { useData } from '../../app/data';
import { t, type MessageKey } from '../../i18n';
import { repo } from '../../storage/repo';
import type { Settings } from '../../storage/types';
import { Icon } from '../../ui/Icon';

type Accent = NonNullable<Settings['accent']>;

/** Each accent in light and dark mode, as in styles.css; the swatch shows both halves. */
const ACCENTS: Array<{ id: Accent; light: string; dark: string }> = [
  { id: 'green', light: '#2f6f4e', dark: '#6cc396' },
  { id: 'teal', light: '#0f6a6a', dark: '#5cc8c2' },
  { id: 'rose', light: '#a3305b', dark: '#f08cb4' },
  { id: 'ink', light: '#15181b', dark: '#f3eedf' },
];

/** Accent colour (owner's ask, 2026-10-23): buttons, switches and highlights; green unless the user picks another. */
export function AccentPicker() {
  const { settings } = useData();
  const current = settings.accent ?? 'green';
  return (
    <div className="accent-picker" role="radiogroup" aria-labelledby="accent-label">
      {ACCENTS.map((a) => (
        <button key={a.id} type="button" role="radio" aria-checked={current === a.id} className="accent-option" onClick={() => void repo.updateSettings({ accent: a.id })}>
          <span className="accent-swatch" style={{ background: `linear-gradient(135deg, ${a.light} 50%, ${a.dark} 50%)` }} aria-hidden>
            {current === a.id && <Icon name="check" size={16} />}
          </span>
          {t(`settings.accent.${a.id}` as MessageKey)}
        </button>
      ))}
    </div>
  );
}
