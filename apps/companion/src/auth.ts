import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { chmodSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import type { Store } from './db';

/**
 * The login of the companion. What it protects is what must not be done by whoever is in the workshop
 * network: loading code onto the Pi (the update), powering it down, and the login itself. Everything else
 * stays open as before (libraries, state, the relay to FluidNC) – protecting those would stop every device
 * that has not logged in from saving its settings.
 *
 * A device logs in once with the **Pi code** (12 characters from an alphabet without look-alikes, made at the
 * first start and kept in a file only the service user reads; `setup.sh` shows it) and gets a **token**: 32
 * random bytes, of which the Pi keeps only the SHA-256. The app sends the token as `Authorization: Bearer …`.
 * Tokens end when the operator removes the device, or renews the code and removes the others. The code and the
 * token travel in clear over http: this keeps out other web pages and casual devices, not someone who listens
 * to the WLAN.
 */

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 12;
/** The collection of the devices in the database (not one of the library: it is never served) */
const COLLECTION = 'auth-devices';
const MAX_DEVICES = 20;

export interface Device {
  id: string;
  name: string;
  createdAt: number;
  lastSeen: number;
}

export interface Limits {
  /** Failures per address within `windowMs` after which that address waits */
  perAddress: number;
  /** Failures from everywhere within `windowMs` after which everybody waits */
  overall: number;
  windowMs: number;
}

export const DEFAULT_LIMITS: Limits = { perAddress: 5, overall: 40, windowMs: 5 * 60_000 };

export type LoginResult =
  | { ok: true; token: string; device: Device }
  | { ok: false; reason: 'wrong-code' }
  | { ok: false; reason: 'locked'; retryAfterMs: number };

export interface AuthOptions {
  store: Store;
  /** Where the Pi code is kept; made if it is not there */
  codeFile: string;
  now?: () => number;
  limits?: Limits;
}

/** `ABCD-EFGH-JKLM` from 12 characters */
export function formatCode(raw: string): string {
  return (raw.match(/.{1,4}/g) ?? []).join('-');
}

/** What was typed, made comparable: capitals, no dashes or spaces. */
export function normalizeCode(typed: string): string {
  return typed.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

const hash = (token: string) => createHash('sha256').update(token).digest('hex');

/** A device name from outside: a few plain characters. */
export function cleanName(name: unknown): string {
  const text = typeof name === 'string' ? name.replace(/[^\p{L}\p{N} ._()+-]/gu, '').trim() : '';
  return text.slice(0, 40) || 'Gerät';
}

export class Auth {
  private code: string;
  private readonly now: () => number;
  private readonly limits: Limits;
  private readonly byAddress = new Map<string, number[]>();
  private failures: number[] = [];
  private readonly touched = new Map<string, number>();

  constructor(private readonly options: AuthOptions) {
    this.now = options.now ?? Date.now;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.code = this.loadCode();
  }

  private makeCode(): string {
    let code = '';
    for (let i = 0; i < CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
    return code;
  }

  /** The code into its file, whole or not at all: a temporary file with the right rights, renamed over the old one. */
  private save(code: string): void {
    const file = this.options.codeFile;
    const tmp = `${file}.tmp`;
    try {
      writeFileSync(tmp, `${formatCode(code)}\n`, { mode: 0o600 });
      // A temporary file left from before keeps its mode otherwise
      chmodSync(tmp, 0o600);
      renameSync(tmp, file);
    } catch (error) {
      rmSync(tmp, { force: true });
      throw error;
    }
  }

  private loadCode(): string {
    const file = this.options.codeFile;
    try {
      const code = normalizeCode(readFileSync(file, 'utf8'));
      if (code.length === CODE_LENGTH && [...code].every((c) => ALPHABET.includes(c))) {
        // A copy or a restore may have brought it with other rights
        chmodSync(file, 0o600);
        return code;
      }
    } catch {
      // not there, or not readable: a file that cannot be used is no code – a new one is made below
    }
    const code = this.makeCode();
    // Whatever stands in the way (a file of another owner, a folder) goes: the data folder is the service user's
    rmSync(file, { recursive: true, force: true });
    this.save(code);
    return code;
  }

  /** The code as the operator reads it: `ABCD-EFGH-JKLM`. */
  currentCode(): string {
    return formatCode(this.code);
  }

  /** A new code; the old one stops working. The devices stay logged in unless `revokeOthers` says so. */
  renewCode(): string {
    // The new code counts only once it is on the disk: a write that fails leaves the old one working
    const code = this.makeCode();
    this.save(code);
    this.code = code;
    return this.currentCode();
  }

  private recent(times: number[], at: number): number[] {
    return times.filter((t) => at - t < this.limits.windowMs);
  }

  login(typed: unknown, name: unknown, address: string): LoginResult {
    const at = this.now();
    const mine = this.recent(this.byAddress.get(address) ?? [], at);
    this.failures = this.recent(this.failures, at);
    const wait = (times: number[], max: number) =>
      times.length >= max ? this.limits.windowMs - (at - times[0]!) : 0;
    const retry = Math.max(
      wait(mine, this.limits.perAddress),
      wait(this.failures, this.limits.overall),
    );
    if (retry > 0) return { ok: false, reason: 'locked', retryAfterMs: retry };

    const given = Buffer.from(
      normalizeCode(typeof typed === 'string' ? typed : '').padEnd(CODE_LENGTH + 1, '_'),
    );
    const real = Buffer.from(this.code.padEnd(CODE_LENGTH + 1, '_'));
    if (given.length !== real.length || !timingSafeEqual(given, real)) {
      mine.push(at);
      this.byAddress.set(address, mine);
      this.failures.push(at);
      // The map must not grow with every address that ever failed
      if (this.byAddress.size > 1000) {
        for (const [key, times] of this.byAddress) {
          if (this.recent(times, at).length === 0) this.byAddress.delete(key);
        }
      }
      return { ok: false, reason: 'wrong-code' };
    }
    this.byAddress.delete(address);
    const token = randomBytes(32).toString('base64url');
    const device: Device = {
      id: randomBytes(6).toString('hex'),
      name: cleanName(name),
      createdAt: at,
      lastSeen: at,
    };
    this.options.store.put(COLLECTION, hash(token), device, at);
    this.trim();
    return { ok: true, token, device };
  }

  /** The oldest devices go beyond `MAX_DEVICES`. */
  private trim(): void {
    const all = this.options.store.list(COLLECTION);
    for (const old of all.slice(0, Math.max(0, all.length - MAX_DEVICES))) {
      this.options.store.delete(COLLECTION, old.id);
    }
  }

  /** The device a token belongs to, or null. A seen device is noted at most once a minute. */
  verify(token: string | undefined): Device | null {
    if (!token || token.length > 100) return null;
    const key = hash(token);
    const doc = this.options.store.get(COLLECTION, key);
    if (!doc) return null;
    const device = doc.data as Device;
    const at = this.now();
    if (at - (this.touched.get(key) ?? 0) > 60_000) {
      this.touched.set(key, at);
      this.options.store.put(COLLECTION, key, { ...device, lastSeen: at }, device.createdAt);
    }
    return device;
  }

  devices(): Device[] {
    return this.options.store
      .list(COLLECTION)
      .map((d) => d.data as Device)
      .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1));
  }

  /** Takes a device off (its token stops working). */
  revoke(id: string): boolean {
    for (const doc of this.options.store.list(COLLECTION)) {
      if ((doc.data as Device).id === id) {
        this.touched.delete(doc.id);
        return this.options.store.delete(COLLECTION, doc.id);
      }
    }
    return false;
  }

  revokeOthers(keep: string): number {
    let n = 0;
    for (const device of this.devices()) if (device.id !== keep && this.revoke(device.id)) n++;
    return n;
  }
}
