import { hasKey, t, type MessageKey } from '../i18n';
import { de } from '../i18n/de';
import { en } from '../i18n/en';
import { COMMANDS, placeKeys, type Command } from './commands';
import { search, type SearchDoc } from './search';

/**
 * The quick search over the table of commands: their labels in the language
 * on screen, their keywords in both – a German word finds its function in
 * the English app and the other way round.
 */

const WORDS: readonly Record<string, string>[] = [de.find.words, en.find.words];
const BOTH: readonly unknown[] = [de, en];

function text(dictionary: unknown, key: string): string | undefined {
  let node = dictionary;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

/** The keywords of a command: its lists in both languages, and its name in both. */
export function keywordsOf(command: Command): string[] {
  const lists = WORDS.flatMap((words) => (words[command.id] ?? '').split(','));
  const titles = BOTH.map((dictionary) => text(dictionary, command.title) ?? '');
  return [...lists, ...titles].map((word) => word.trim()).filter((word) => word !== '');
}

/** Where a command lives, as it is said on screen: "Job · Extras". */
export function placeOf(command: Command): string {
  return placeKeys(command)
    .filter(hasKey)
    .map((key) => t(key as MessageKey))
    .join(' · ');
}

/** The name of a command as it stands on screen (steps without their number). */
export function titleOf(command: Command): string {
  return t(command.title).replace(/^\d+ · /, '');
}

function docs(): SearchDoc[] {
  return COMMANDS.map((command) => ({
    id: command.id,
    title: titleOf(command),
    place: placeOf(command),
    keywords: keywordsOf(command),
  }));
}

/** How many hits the list shows at most */
export const HIT_COUNT = 24;

/** The commands a query finds, best first. */
export function findCommands(query: string): Command[] {
  const byId = new Map(COMMANDS.map((command) => [command.id, command]));
  return search(query, docs())
    .slice(0, HIT_COUNT)
    .map((hit) => byId.get(hit.id)!);
}
