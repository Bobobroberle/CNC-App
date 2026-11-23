/**
 * The app's own number pad (DESIGN.md §8): what a key does to the text of a
 * number field, and what the field's label says about its unit. Pure – the
 * layer that shows the pad (`components/NumpadLayer.tsx`) writes the result
 * into the field, where `parseNumber` reads it as it reads typed text.
 */
export type NumpadKey =
  | '0'
  | '1'
  | '2'
  | '3'
  | '4'
  | '5'
  | '6'
  | '7'
  | '8'
  | '9'
  | 'separator'
  | 'sign'
  | 'back'
  | 'clear';

export interface NumpadRules {
  /** The decimal sign of the language: comma or point */
  separator: ',' | '.';
  /** Whole numbers only (`inputmode="numeric"`): no decimal sign */
  whole?: boolean;
}

/** The text after a key. Keys act at the end of the text, like a pocket calculator. */
export function pressKey(text: string, key: NumpadKey, rules: NumpadRules): string {
  switch (key) {
    case 'clear':
      return '';
    case 'back':
      return text.slice(0, -1);
    case 'sign':
      return text.startsWith('-') || text.startsWith('−') ? text.slice(1) : `-${text}`;
    case 'separator': {
      if (rules.whole || /[.,]/.test(text)) return text;
      const digits = text.replace(/^[-−]/, '');
      // "," alone means "0,": a number never starts with its decimal sign.
      return `${text}${digits === '' ? '0' : ''}${rules.separator}`;
    }
    default:
      return `${text}${key}`;
  }
}

const UNITS = ['mm/min', 'U/min', 'rpm', 'mm', 'px/mm', 'px', '°', '%', 'ms', 'min', 's'];

/** The unit a label names – "Sichere Höhe (mm)" → "mm" –, or null if it names none. */
export function unitOf(label: string): string | null {
  for (const unit of UNITS) {
    const escaped = unit.replace(/[/°%]/g, '\\$&');
    if (new RegExp(`(^|[\\s(,])${escaped}([\\s),.:]|$)`).test(label)) return unit;
  }
  return null;
}

/** The decimal sign of a locale. */
export function separatorOf(locale: string): ',' | '.' {
  return new Intl.NumberFormat(locale).format(1.5).includes(',') ? ',' : '.';
}
