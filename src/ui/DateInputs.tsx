import type { InputHTMLAttributes } from 'react';
import { formatDate, weekdayShort } from '../lib/dates';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value'> & { value: string };

/**
 * Native date and time pickers show their text in the phone's locale (often
 * 10/22/2026, 1:45 PM). These keep the native picker but show the value the
 * German way on top of it: the input is invisible and covers the text.
 */
function Picker({ type, value, display, className, ...rest }: Props & { type: 'date' | 'time' | 'datetime-local'; display: string }) {
  return (
    <span className={`picker${className ? ` ${className}` : ''}`}>
      <span className="picker-text" aria-hidden="true">
        {display || '–'}
      </span>
      <input
        {...rest}
        type={type}
        value={value}
        onClick={(e) => {
          rest.onClick?.(e);
          // Desktop Chrome only opens the picker from its icon; open it from anywhere.
          try {
            e.currentTarget.showPicker?.();
          } catch {
            // Not allowed in this context; the browser falls back to its own behaviour.
          }
        }}
      />
    </span>
  );
}

const dateText = (key: string) => (/^\d{4}-\d{2}-\d{2}$/.test(key) ? `${weekdayShort(key)} ${formatDate(key)}` : '');

/** Value as YYYY-MM-DD; shown as "Thu 22.10.2026". */
export function DateInput(props: Props) {
  return <Picker {...props} type="date" display={dateText(props.value)} />;
}

/** Value as HH:MM (24-hour already). */
export function TimeInput(props: Props) {
  return <Picker {...props} type="time" display={props.value} />;
}

/** Value as YYYY-MM-DDTHH:MM; shown as "Thu 22.10.2026, 13:45". */
export function DateTimeInput(props: Props) {
  const [day = '', time = ''] = props.value.split('T');
  const text = dateText(day);
  return <Picker {...props} type="datetime-local" display={text && time ? `${text}, ${time.slice(0, 5)}` : ''} />;
}
