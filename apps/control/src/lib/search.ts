/**
 * The matching of the quick search: forgiving about spelling, strict about
 * meaning. Every word of the query has to be found somewhere in an entry –
 * in its title, in the words that say where it lives or in its keywords.
 * A word is found as a whole word, as the beginning of one, somewhere inside
 * one, or – for words long enough to tell – with a typing mistake. Pure:
 * no texts, no DOM.
 */

/** What can be searched: one entry of the list. */
export interface SearchDoc {
  id: string;
  /** The name on screen */
  title: string;
  /** Where it lives ("Job · Extras") */
  place: string;
  /** Other words for it: phrases, any language, any spelling */
  keywords: readonly string[];
}

export interface SearchHit {
  id: string;
  score: number;
}

/**
 * The same letters for every way of writing them: lower case, umlauts and
 * their two-letter forms as the plain vowel (ä = ae = a), ß as ss.
 */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ae/g, 'a')
    .replace(/oe/g, 'o')
    .replace(/ue/g, 'u');
}

/** The words of a text, folded; `$` stays (FluidNC's commands are looked for as "$H"). */
export function words(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}$]+/gu) ?? [];
}

/** How many typing mistakes a word of this length may have */
export function allowedTypos(length: number): number {
  return length < 4 ? 0 : length < 8 ? 1 : 2;
}

/**
 * The fewest edits (a letter too many, one missing, one wrong, two swapped)
 * that turn `typed` into the beginning of `word` – so a mistyped word is
 * also found while it is still being typed. Stops counting above `limit`.
 */
export function prefixDistance(typed: string, word: string, limit: number): number {
  const n = typed.length;
  const m = Math.min(word.length, n + limit);
  let before: number[] = [];
  let row = Array.from({ length: m + 1 }, (_, j) => j);
  for (let i = 1; i <= n; i += 1) {
    const next = [i];
    for (let j = 1; j <= m; j += 1) {
      const same = typed[i - 1] === word[j - 1];
      let best = Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + (same ? 0 : 1));
      if (i > 1 && j > 1 && typed[i - 1] === word[j - 2] && typed[i - 2] === word[j - 1]) {
        best = Math.min(best, before[j - 2]! + 1);
      }
      next.push(best);
    }
    before = row;
    row = next;
  }
  return Math.min(...row);
}

/** How well one typed word matches one word of an entry: 0 for not at all. */
const EXACT = 90;
const PREFIX = 70;
const INSIDE = 40;
const FUZZY = 30;
/** A match without a typing mistake always ranks above one with */
const CLEAN = 1000;

export function wordScore(typed: string, word: string): number {
  if (word === typed) return CLEAN + EXACT;
  if (word.startsWith(typed)) return CLEAN + PREFIX;
  // One or two letters are inside almost every word: they only count at its beginning.
  if (typed.length >= 3 && word.includes(typed)) return CLEAN + INSIDE;
  const limit = allowedTypos(typed.length);
  // A mistake in the very first letter is rare, and allowing it finds far too much.
  if (limit === 0 || typed[0] !== word[0]) return 0;
  const distance = prefixDistance(typed, word, limit);
  return distance <= limit ? FUZZY - 10 * distance : 0;
}

/** Where a word was found: in the title counts most, then the keywords, then the place. */
const FIELD = { title: 300, keywords: 200, place: 100 } as const;

interface Prepared {
  id: string;
  title: string[];
  keywords: string[];
  place: string[];
  whole: string;
}

function prepare(doc: SearchDoc): Prepared {
  return {
    id: doc.id,
    title: words(doc.title),
    keywords: doc.keywords.flatMap(words),
    place: words(doc.place),
    whole: words(doc.title).join(' '),
  };
}

function best(typed: string, list: readonly string[]): number {
  let score = 0;
  for (const word of list) score = Math.max(score, wordScore(typed, word));
  return score;
}

function docScore(query: readonly string[], doc: Prepared): number {
  let total = 0;
  for (const typed of query) {
    let found = 0;
    for (const field of ['title', 'keywords', 'place'] as const) {
      const score = best(typed, doc[field]);
      if (score > 0) found = Math.max(found, score + FIELD[field]);
    }
    // Every word has to be found somewhere.
    if (found === 0) return 0;
    total += found;
  }
  // Typed exactly as it is called: that one first.
  if (doc.whole === query.join(' ')) total += 50;
  return total;
}

/**
 * The entries a query finds, best first; entries that match equally well
 * keep the order of `docs`. An empty query finds nothing – what to show
 * then is not a matter of matching.
 */
export function search(query: string, docs: readonly SearchDoc[]): SearchHit[] {
  const typed = words(query);
  if (typed.length === 0) return [];
  return docs
    .map((doc, index) => ({ id: doc.id, score: docScore(typed, prepare(doc)), index }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(({ id, score }) => ({ id, score }));
}
