/** Fixed decimals with a real minus sign, for large tabular readouts. */
export function formatCoordinate(value: number | undefined, decimals = 2): string {
  if (value === undefined || !Number.isFinite(value)) return '—';
  const text = Math.abs(value).toFixed(decimals);
  const negative = value < 0 && Number(text) !== 0;
  return negative ? `−${text}` : text;
}

/** Seconds → "1:02:03" or "2:03". */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(s).padStart(2, '0')}`;
}

let locale = 'de-DE';

/** Number and date format of the UI language. */
export function setLocale(next: string): void {
  locale = next;
}

export function getLocale(): string {
  return locale;
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * A number as it stands in a field the operator edits: the decimal sign of the language, but no grouping of thousands –
 * `parseNumber` reads "4.600" as 4.6, so a field that shows it that way could not be left alone without changing it.
 */
export function formatField(value: number, max = 2): string {
  return value.toLocaleString(locale, {
    useGrouping: false,
    minimumFractionDigits: 0,
    maximumFractionDigits: max,
  });
}

/** A number as it was typed: no decimals that are zero ("180", "12,5", "3,2"), at most `max` ("3,33"). */
export function formatPlain(value: number, max = 2): string {
  return value.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: max });
}

/**
 * A length or shift in the UI language with a real minus sign – and, if
 * asked, a plus – for results that are read, not tabulated ("−0,7", "+11,8").
 */
export function formatSigned(value: number, decimals = 1, plus = false): string {
  const text = formatNumber(Math.abs(value), decimals);
  const zero = Number(Math.abs(value).toFixed(decimals)) === 0;
  if (zero) return text;
  return value < 0 ? `−${text}` : plus ? `+${text}` : text;
}

/** Ist/Soll colour like the prototype: < 0.1 mm good, < 1 mm watch, above that bad. */
export function deviationLevel(mm: number | null): 'ok' | 'warn' | 'bad' | null {
  if (mm === null) return null;
  return mm < 0.1 ? 'ok' : mm < 1 ? 'warn' : 'bad';
}

/**
 * A number as it is typed on a German keyboard or copied from the screen:
 * decimal comma or point, the typographic minus of the readouts, spaces or
 * apostrophes between thousands. With both comma and point, the last one is
 * the decimal sign ("1.234,5" and "1,234.5" are both 1234.5). Empty text is
 * 0, like `Number('')`; anything that is not a number is NaN.
 */
export function parseNumber(text: string): number {
  let s = text
    .trim()
    .replace(/[\u2212\u2013]/g, '-')
    .replace(/[\s\u00a0\u202f']/g, '');
  if (s.includes(',') && s.includes('.')) {
    const grouping = s.lastIndexOf(',') > s.lastIndexOf('.') ? '.' : ',';
    s = s.split(grouping).join('');
  }
  return Number(s.replace(',', '.'));
}
