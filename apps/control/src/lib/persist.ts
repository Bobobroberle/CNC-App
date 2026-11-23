/** Small JSON storage helpers: storage may be missing or full (file://, private mode). */
export type KeyValueStorage = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Full demo, "as if set up and calibrated": a page built as the demo
 * (`LOWRIDER_DEMO = 'full'`) or opened as `…#demo`. Decided once, before the
 * stores load, because the demo must never touch the real settings.
 */
export function isFullDemo(
  flag: unknown = (globalThis as { LOWRIDER_DEMO?: unknown }).LOWRIDER_DEMO,
  hash: string = typeof location === 'undefined' ? '' : location.hash,
): boolean {
  return flag === 'full' || hash === '#demo';
}

/** Storage that lives only as long as the page: what the demo writes is gone on reload. */
export function memoryStorage(): KeyValueStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, String(value)),
  };
}

/** The page's localStorage, or undefined where even touching it throws (sandboxed frames). */
function pageStorage(): KeyValueStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** Where settings and libraries are kept: the page's storage, or memory in the demo. */
export const browserStorage: KeyValueStorage | undefined = isFullDemo()
  ? memoryStorage()
  : pageStorage();

export function loadJson<T>(
  storage: Pick<Storage, 'getItem'> | undefined,
  key: string,
  validate: (value: unknown) => T | null,
  fallback: T,
): T {
  try {
    const raw = storage?.getItem(key);
    if (raw === null || raw === undefined) return fallback;
    return validate(JSON.parse(raw)) ?? fallback;
  } catch {
    return fallback;
  }
}

export function saveJson(
  storage: Pick<Storage, 'setItem'> | undefined,
  key: string,
  value: unknown,
) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // full or unavailable storage: the value still applies until reload
  }
}

/** Validates every entry of an array; drops the whole list if one entry is broken. */
export function listOf<T>(validate: (v: unknown) => T | null) {
  return (value: unknown): T[] | null => {
    if (!Array.isArray(value)) return null;
    const out = value.map(validate);
    return out.every((v) => v !== null) ? (out as T[]) : null;
  };
}

/** Short random id for library entries. */
export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
