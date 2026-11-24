export function writeZip(
  entries: { name: string; data?: Uint8Array; mode?: number }[],
  options?: { at?: Date; store?: boolean },
): Buffer;
