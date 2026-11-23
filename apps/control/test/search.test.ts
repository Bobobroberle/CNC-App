import { describe, expect, it } from 'vitest';
import {
  allowedTypos,
  fold,
  prefixDistance,
  search,
  words,
  wordScore,
  type SearchDoc,
} from '../src/lib/search';

const DOCS: SearchDoc[] = [
  { id: 'zero', title: 'Nullpunkt', place: 'Bühne', keywords: ['null', 'zero', 'ursprung'] },
  { id: 'homing', title: 'Referenzfahrt', place: 'Fahren · Joggen', keywords: ['homing', '$H'] },
  { id: 'clamp', title: 'Spannmittel', place: 'Bühne', keywords: ['zwinge', 'schraubzwinge'] },
  { id: 'cutter', title: 'Fräser', place: 'Maschine · Werkzeuge', keywords: ['bit', 'maß'] },
  { id: 'saved', title: 'Nullpunkt-Speicher', place: 'Fahren · Nullpunkte', keywords: ['merken'] },
  { id: 'long', title: 'In Abschnitten fräsen', place: 'Job · Prüfen', keywords: ['zu lang'] },
  { id: 'zoom', title: 'Einpassen', place: 'Bühne', keywords: ['nullen der ansicht'] },
];
const ids = (query: string) => search(query, DOCS).map((hit) => hit.id);

describe('folding', () => {
  it('writes umlauts, their two-letter forms and ß the same way', () => {
    expect(fold('Fräser')).toBe('fraser');
    expect(fold('Fraeser')).toBe('fraser');
    expect(fold('FRASER')).toBe('fraser');
    expect(fold('Maß')).toBe('mass');
    expect(fold('Übersicht')).toBe(fold('uebersicht'));
    expect(fold('Größe')).toBe(fold('groesse'));
    expect(fold('é')).toBe('e');
  });

  it('splits into words and keeps $ for FluidNC commands', () => {
    expect(words('Nullpunkt-Speicher (G54)')).toEqual(['nullpunkt', 'speicher', 'g54']);
    expect(words('$H, $X')).toEqual(['$h', '$x']);
    expect(words('  ')).toEqual([]);
  });
});

describe('typing mistakes', () => {
  it('allows none in short words, one in middle ones, two in long ones', () => {
    expect([1, 3, 4, 7, 8, 14].map(allowedTypos)).toEqual([0, 0, 1, 1, 2, 2]);
  });

  it('counts a missing, a wrong, an extra and two swapped letters as one each', () => {
    expect(prefixDistance('nulpunkt', 'nullpunkt', 2)).toBe(1);
    expect(prefixDistance('nullpumkt', 'nullpunkt', 2)).toBe(1);
    expect(prefixDistance('nulllpunkt', 'nullpunkt', 2)).toBe(1);
    expect(prefixDistance('nullpnukt', 'nullpunkt', 2)).toBe(1);
    expect(prefixDistance('nullpunkt', 'nullpunkt', 2)).toBe(0);
  });

  it('measures against the beginning of the word: a mistyped word still being typed', () => {
    expect(prefixDistance('refrenz', 'referenzfahrt', 1)).toBe(1);
    expect(prefixDistance('zwnge', 'zu', 1)).toBeGreaterThan(1);
  });
});

describe('one word against one word', () => {
  it('ranks whole word, beginning, inside, mistyped – in that order', () => {
    const whole = wordScore('null', 'null');
    const start = wordScore('null', 'nullpunkt');
    const inside = wordScore('punkt', 'nullpunkt');
    const typo = wordScore('nulpunkt', 'nullpunkt');
    expect(whole).toBeGreaterThan(start);
    expect(start).toBeGreaterThan(inside);
    expect(inside).toBeGreaterThan(typo);
    expect(typo).toBeGreaterThan(0);
  });

  it('finds one or two letters only at the beginning of a word, never by guessing', () => {
    expect(wordScore('n', 'nullpunkt')).toBeGreaterThan(0);
    expect(wordScore('ul', 'nullpunkt')).toBe(0);
    expect(wordScore('nu', 'nullpunkt')).toBeGreaterThan(0);
    expect(wordScore('nx', 'nullpunkt')).toBe(0);
    expect(wordScore('nax', 'nut')).toBe(0);
  });

  it('does not guess when the first letter is wrong or too much is wrong', () => {
    expect(wordScore('hullpunkt', 'nullpunkt')).toBe(0);
    expect(wordScore('nxlp', 'nullpunkt')).toBe(0);
    expect(wordScore('zwnge', 'zwinge')).toBeGreaterThan(0);
    expect(wordScore('zwngx', 'zwinge')).toBe(0);
  });
});

describe('search', () => {
  it('finds by title, by keyword and by place, whatever the case', () => {
    expect(ids('NULLPUNKT')).toEqual(['zero', 'saved']);
    expect(ids('zwinge')).toEqual(['clamp']);
    expect(ids('homing')).toEqual(['homing']);
    expect(ids('werkzeuge')).toEqual(['cutter']);
  });

  it('forgives typing mistakes', () => {
    expect(ids('nulpunkt')[0]).toBe('zero');
    expect(ids('refrenzfahrt')).toEqual(['homing']);
    expect(ids('zwnge')).toEqual(['clamp']);
    expect(ids('spanmittel')).toEqual(['clamp']);
  });

  it('takes umlauts written any way', () => {
    expect(ids('fraeser')).toEqual(ids('fräser'));
    expect(ids('fraser')[0]).toBe('cutter');
    expect(ids('mass')).toEqual(['cutter']);
    expect(ids('buhne')).toEqual(ids('Bühne'));
  });

  it('puts a hit in the title before a hit in the keywords, and clean hits before guesses', () => {
    // "null": title beginning (zero, saved) before the keyword of the zoom entry.
    expect(ids('null')).toEqual(['zero', 'saved', 'zoom']);
    // Typed exactly as it is called comes first, even when it is later in the list.
    expect(ids('nullpunkt-speicher')[0]).toBe('saved');
    // A clean keyword hit before a guessed title: "nullen" is a keyword of zoom,
    // and only a mistyped "nullpunkt" for the others.
    expect(ids('nullen')[0]).toBe('zoom');
  });

  it('asks for every word, each of them anywhere', () => {
    expect(ids('zu lang')).toEqual(['long']);
    expect(ids('fahren null')).toEqual(['saved']);
    expect(ids('null zwinge')).toEqual([]);
    expect(ids('abschnitt job')).toEqual(['long']);
  });

  it('keeps the order of the list for equally good hits', () => {
    expect(ids('bühne')).toEqual(['zero', 'clamp', 'zoom']);
    expect(search('bühne', [...DOCS].reverse()).map((h) => h.id)).toEqual([
      'zoom',
      'clamp',
      'zero',
    ]);
  });

  it('does not find everything for one or two letters', () => {
    expect(ids('z')).toEqual(['zero', 'clamp', 'long']);
    expect(ids('ul')).toEqual([]);
    expect(ids('nu')).toEqual(['zero', 'saved', 'zoom']);
  });

  it('finds nothing for nothing and for nonsense', () => {
    expect(ids('')).toEqual([]);
    expect(ids('   ')).toEqual([]);
    expect(ids('xyzq')).toEqual([]);
    expect(ids('$h')).toEqual(['homing']);
  });
});
