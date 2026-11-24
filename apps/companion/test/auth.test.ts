import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Auth, cleanName, formatCode, normalizeCode, type Limits } from '../src/auth';
import { Store } from '../src/db';

const ALPHABET =
  /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/;

function rig(limits?: Limits) {
  const dir = mkdtempSync(join(tmpdir(), 'lowrider-auth-'));
  const codeFile = join(dir, 'pi-code.txt');
  const store = new Store();
  const clock = { at: 1_000_000 };
  const make = () => new Auth({ store, codeFile, now: () => clock.at, limits });
  return { dir, codeFile, store, clock, auth: make(), make };
}

describe('the Pi code', () => {
  it('is made at the first start, in a file only its owner reads, from an alphabet without look-alikes', () => {
    const { auth, codeFile } = rig();
    expect(auth.currentCode()).toMatch(ALPHABET);
    expect(readFileSync(codeFile, 'utf8')).toBe(`${auth.currentCode()}\n`);
    expect(statSync(codeFile).mode & 0o777).toBe(0o600);
    // never made twice the same: 12 characters of 32
    const codes = new Set(Array.from({ length: 30 }, () => rig().auth.currentCode()));
    expect(codes.size).toBe(30);
  });

  it('is kept across a restart, and made anew from a file that is none', () => {
    const { auth, make, codeFile } = rig();
    expect(make().currentCode()).toBe(auth.currentCode());
    for (const bad of ['', 'short', 'ABCD-EFGH-JKLM-NPQR', 'ABCD-EFGH-JK0M', 'abcd efgh jkl!']) {
      writeFileSync(codeFile, bad);
      chmodSync(codeFile, 0o644);
      const fresh = make().currentCode();
      expect(fresh, bad).toMatch(ALPHABET);
      expect(readFileSync(codeFile, 'utf8')).toBe(`${fresh}\n`);
      // a file that was there with other rights is closed to others
      expect(statSync(codeFile).mode & 0o777).toBe(0o600);
    }
    // a hand-written code of the alphabet, in small letters and with spaces, is accepted as it is read
    writeFileSync(codeFile, ' abcd efgh jklm \n');
    expect(make().currentCode()).toBe('ABCD-EFGH-JKLM');
  });

  it('is renewed on request: the new one is on the disk and the old one no longer opens', () => {
    const { auth, codeFile } = rig();
    const old = auth.currentCode();
    const fresh = auth.renewCode();
    expect(fresh).not.toBe(old);
    expect(readFileSync(codeFile, 'utf8')).toBe(`${fresh}\n`);
    expect(auth.login(old, 'PC', 'a')).toMatchObject({ ok: false, reason: 'wrong-code' });
    expect(auth.login(fresh, 'PC', 'a')).toMatchObject({ ok: true });
  });

  it('is read as it is typed', () => {
    expect(normalizeCode(' abcd-efgh jklm ')).toBe('ABCDEFGHJKLM');
    expect(normalizeCode('a.b_c!')).toBe('ABC');
    expect(formatCode('ABCDEFGHJKLM')).toBe('ABCD-EFGH-JKLM');
    expect(formatCode('')).toBe('');
  });
});

describe('the file of the code, when something is wrong with it', () => {
  it('takes a valid file with other rights and closes it to others', () => {
    const { auth, make, codeFile } = rig();
    chmodSync(codeFile, 0o644);
    expect(make().currentCode()).toBe(auth.currentCode());
    expect(statSync(codeFile).mode & 0o777).toBe(0o600);
  });

  it('makes a new code where the file cannot be read – a folder in its place, say – instead of dying at the start', () => {
    const { make, codeFile } = rig();
    rmSync(codeFile);
    mkdirSync(join(codeFile, 'inside'), { recursive: true });
    const auth = make();
    expect(auth.currentCode()).toMatch(ALPHABET);
    expect(readFileSync(codeFile, 'utf8')).toBe(`${auth.currentCode()}\n`);
    expect(statSync(codeFile).isFile()).toBe(true);
  });

  it('keeps the old code when the new one cannot be written – it is the old one that works, and the restart finds it', () => {
    const { auth, dir, codeFile, make } = rig();
    const old = auth.currentCode();
    rmSync(dir, { recursive: true, force: true });
    expect(() => auth.renewCode()).toThrow();
    expect(auth.currentCode()).toBe(old);
    expect(auth.login(old, 'PC', 'a')).toMatchObject({ ok: true });
    // no half file is left, and a file that was there is whole
    mkdirSync(dir, { recursive: true });
    writeFileSync(codeFile, `${old}\n`);
    expect(make().currentCode()).toBe(old);
    expect(() => readFileSync(`${codeFile}.tmp`)).toThrow();
  });
});

describe('logging in', () => {
  it('gives a token for the right code however it is written, and keeps only the hash of it', () => {
    const { auth, store } = rig();
    const code = auth.currentCode();
    const typed = [code, code.toLowerCase(), code.replaceAll('-', ''), ` ${code} `];
    for (const t of typed) {
      const r = auth.login(t, 'iPad', 'a');
      expect(r.ok, t).toBe(true);
      if (!r.ok) continue;
      expect(r.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(auth.verify(r.token)?.id).toBe(r.device.id);
      // the token itself is nowhere in the database
      expect(JSON.stringify(store.list('auth-devices'))).not.toContain(r.token);
    }
    expect(auth.devices()).toHaveLength(typed.length);
  });

  it('refuses a wrong code, a code of the wrong length, and what is no text', () => {
    const { auth } = rig({ perAddress: 1000, overall: 1000, windowMs: 1000 });
    for (const bad of [
      '',
      'AAAA-AAAA-AAAA',
      auth.currentCode().slice(0, 11),
      `${auth.currentCode()}X`,
      5,
      null,
      undefined,
      {},
    ]) {
      expect(auth.login(bad, 'x', 'a'), String(bad)).toEqual({ ok: false, reason: 'wrong-code' });
    }
    expect(auth.devices()).toEqual([]);
  });

  it('names the device by a few plain characters', () => {
    expect(cleanName('  Roberts iPad (Werkstatt)  ')).toBe('Roberts iPad (Werkstatt)');
    expect(cleanName('<script>alert(1)</script>')).toBe('scriptalert(1)script');
    expect(cleanName('a<b>/c\\d"e')).toBe('abcde');
    expect(cleanName('x'.repeat(100))).toHaveLength(40);
    expect(cleanName('')).toBe('Gerät');
    expect(cleanName(5)).toBe('Gerät');
    expect(cleanName('???')).toBe('Gerät');
  });
});

describe('guessing the code', () => {
  const limits: Limits = { perAddress: 3, overall: 5, windowMs: 60_000 };

  it('makes an address wait after a few failures – and tells how long – while others may still try', () => {
    const { auth, clock } = rig(limits);
    for (let i = 0; i < 3; i++)
      expect(auth.login('wrong', 'x', 'a')).toMatchObject({ reason: 'wrong-code' });
    clock.at += 10_000;
    const locked = auth.login(auth.currentCode(), 'x', 'a');
    expect(locked).toEqual({ ok: false, reason: 'locked', retryAfterMs: 50_000 });
    // another address is not held up by it
    expect(auth.login(auth.currentCode(), 'x', 'b')).toMatchObject({ ok: true });
    // after the window it may try again, and the right code works
    clock.at += 51_000;
    expect(auth.login(auth.currentCode(), 'x', 'a')).toMatchObject({ ok: true });
  });

  it('makes everybody wait when the failures from everywhere are too many', () => {
    const { auth, clock } = rig(limits);
    for (let i = 0; i < 5; i++) auth.login('wrong', 'x', `address-${i}`);
    const r = auth.login(auth.currentCode(), 'x', 'a-new-address');
    expect(r).toMatchObject({ ok: false, reason: 'locked' });
    clock.at += 61_000;
    expect(auth.login(auth.currentCode(), 'x', 'a-new-address')).toMatchObject({ ok: true });
  });

  it('forgets an address that logged in, and does not grow without end', () => {
    const { auth, clock } = rig({ perAddress: 3, overall: 100_000, windowMs: 1000 });
    auth.login('wrong', 'x', 'a');
    auth.login('wrong', 'x', 'a');
    expect(auth.login(auth.currentCode(), 'x', 'a')).toMatchObject({ ok: true });
    // the two failures are forgotten: three more are needed to lock it
    auth.login('wrong', 'x', 'a');
    auth.login('wrong', 'x', 'a');
    expect(auth.login('wrong', 'x', 'a')).toMatchObject({ reason: 'wrong-code' });
    expect(auth.login('wrong', 'x', 'a')).toMatchObject({ reason: 'locked' });
    // very many addresses, each failing once: the old ones are let go
    for (let i = 0; i < 1100; i++) {
      clock.at += 2;
      auth.login('wrong', 'x', `address-${i}`);
    }
    clock.at += 5000;
    expect(auth.login(auth.currentCode(), 'x', 'address-1')).toMatchObject({ ok: true });
  });
});

describe('tokens and devices', () => {
  it('knows its tokens and nothing else: unknown, empty, too long', () => {
    const { auth } = rig();
    expect(auth.verify(undefined)).toBeNull();
    expect(auth.verify('')).toBeNull();
    expect(auth.verify('nope')).toBeNull();
    expect(auth.verify('x'.repeat(101))).toBeNull();
  });

  it('notes when a device was seen, at most once a minute', () => {
    const { auth, clock, store } = rig();
    const r = auth.login(auth.currentCode(), 'PC', 'a');
    if (!r.ok) throw new Error('login');
    const seen = () => auth.devices()[0]!.lastSeen;
    expect(seen()).toBe(r.device.createdAt);
    clock.at += 30_000;
    auth.verify(r.token);
    // the first sight after the login is within the minute of... the first note (it had none yet): noted
    const first = seen();
    clock.at += 10_000;
    auth.verify(r.token);
    expect(seen()).toBe(first);
    clock.at += 61_000;
    auth.verify(r.token);
    expect(seen()).toBe(clock.at);
    expect(store.list('auth-devices')).toHaveLength(1);
  });

  it('removes a device (its token stops working), the others stay, or all others go', () => {
    const ctx = rig();
    const { auth } = ctx;
    const { clock } = ctx;
    const login = (name: string) => {
      clock.at += 1;
      const r = auth.login(auth.currentCode(), name, 'a');
      if (!r.ok) throw new Error('login');
      return r;
    };
    const [a, b, c] = [login('A'), login('B'), login('C')];
    expect(auth.devices().map((d) => d.name)).toEqual(['A', 'B', 'C']);
    expect(auth.revoke(b.device.id)).toBe(true);
    expect(auth.revoke(b.device.id)).toBe(false);
    expect(auth.verify(b.token)).toBeNull();
    expect(auth.verify(a.token)).not.toBeNull();
    expect(auth.revokeOthers(a.device.id)).toBe(1);
    expect(auth.verify(c.token)).toBeNull();
    expect(auth.verify(a.token)).not.toBeNull();
    expect(auth.revokeOthers(a.device.id)).toBe(0);
  });

  it('keeps no more than twenty devices: the oldest go', () => {
    const { auth, clock } = rig();
    const tokens: string[] = [];
    for (let i = 0; i < 23; i++) {
      clock.at += 1000;
      const r = auth.login(auth.currentCode(), `D${i}`, 'a');
      if (!r.ok) throw new Error('login');
      tokens.push(r.token);
    }
    expect(auth.devices()).toHaveLength(20);
    expect(auth.verify(tokens[0]!)).toBeNull();
    expect(auth.verify(tokens[2]!)).toBeNull();
    expect(auth.verify(tokens[3]!)).not.toBeNull();
    expect(auth.verify(tokens[22]!)).not.toBeNull();
  });
});
