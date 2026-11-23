import { de } from './de';

type Dictionary = typeof de;

/** Same keys as the German dictionary, any string values. */
export type DictionaryShape = { [K in keyof Dictionary]: Shape<Dictionary[K]> };
type Shape<T> = { [K in keyof T]: T[K] extends string ? string : Shape<T[K]> };

type Leaves<T, Prefix extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${Prefix}${K}` : Leaves<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

export type MessageKey = Leaves<Dictionary>;

let dictionary: unknown = de;

/** Replaces the active dictionary (for a future English file). */
export function setDictionary(next: DictionaryShape): void {
  dictionary = next;
}

function lookup(key: string): string | undefined {
  let node: unknown = dictionary;
  for (const part of key.split('.')) {
    if (typeof node !== 'object' || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === 'string' ? node : undefined;
}

function interpolate(text: string, params?: Record<string, string | number>): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function t(key: MessageKey, params?: Record<string, string | number>): string {
  return interpolate(lookup(key) ?? key, params);
}

/** For keys built at runtime (alarm names, diagnostic codes); falls back to `fallback`. */
export function tDynamic(
  key: string,
  fallback: MessageKey,
  params?: Record<string, string | number>,
): string {
  return interpolate(lookup(key) ?? lookup(fallback) ?? key, params);
}

export function hasKey(key: string): boolean {
  return lookup(key) !== undefined;
}
