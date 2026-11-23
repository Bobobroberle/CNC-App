import { setLocale } from '../lib/format';
import { de } from './de';
import { en } from './en';
import { setDictionary } from './index';

export type Language = 'de' | 'en';

/** Switches texts, number format and the document language. */
export function applyLanguage(language: Language): void {
  setDictionary(language === 'en' ? en : de);
  setLocale(language === 'en' ? 'en-GB' : 'de-DE');
  if (typeof document !== 'undefined') document.documentElement.lang = language;
}
