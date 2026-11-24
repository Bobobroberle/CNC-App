import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupName,
  KEEP_FREE_BYTES,
  planBackup,
  reasonOf,
  ROOM_FOR_COPY,
  runBackup,
  runUpdateBackup,
  snapshotInChild,
  type BackupFs,
} from '../src/backup';
import { Store } from '../src/db';

const at = (iso: string) => new Date(iso).getTime();
const name = (day: string) => `lowrider-${day}.db`;

describe('the plan of the daily backup', () => {
  it('names the backup of a day after the day', () => {
    expect(backupName(new Date(2026, 0, 5, 23, 59).getTime())).toBe(name('2026-01-05'));
    expect(backupName(new Date(2026, 11, 31, 0, 0).getTime())).toBe(name('2026-12-31'));
  });

  it('makes today’s when it is not there, and does nothing when it is', () => {
    const now = new Date(2026, 4, 10, 12).getTime();
    expect(planBackup([], now, 7)).toEqual({ create: name('2026-05-10'), remove: [] });
    expect(planBackup([name('2026-05-09')], now, 7).create).toBe(name('2026-05-10'));
    expect(planBackup([name('2026-05-10')], now, 7)).toEqual({ create: null, remove: [] });
  });

  it('keeps the newest few: the oldest go, the one just made never', () => {
    const now = new Date(2026, 4, 10, 12).getTime();
    const days = ['01', '02', '03', '04', '05', '06', '07', '08', '09'].map((d) =>
      name(`2026-05-${d}`),
    );
    const plan = planBackup(days, now, 3);
    expect(plan.create).toBe(name('2026-05-10'));
    // 9 there + today = 10, keep 3: the 7 oldest of them go
    expect(plan.remove).toEqual(days.slice(0, 7));
    expect(planBackup(days, now, 3).remove).not.toContain(name('2026-05-10'));
    // at least one is kept whatever is asked
    expect(planBackup([name('2026-05-09')], now, 0).remove).toEqual([name('2026-05-09')]);
  });

  it('never throws away the copy of today, whatever date the others were made under', () => {
    // a Pi without a clock that started with an earlier date: the copies lie in the future
    const days = ['10', '11', '12', '13', '14', '15', '16'].map((d) => name(`2026-11-${d}`));
    const behind = new Date(2026, 10, 1, 12).getTime();
    const plan = planBackup(days, behind, 7);
    expect(plan.create).toBe(name('2026-11-01'));
    expect(plan.remove).toEqual([name('2026-11-10')]);
    // a clock that was far ahead once, then set right: the future copy goes, today's stays
    const now = new Date(2026, 10, 24, 12).getTime();
    expect(planBackup([name('2030-01-01')], now, 1)).toEqual({
      create: name('2026-11-24'),
      remove: [name('2030-01-01')],
    });
    // today's is there already and a future one too, keep 1: the future one goes
    expect(planBackup([name('2026-11-24'), name('2030-01-01')], now, 1)).toEqual({
      create: null,
      remove: [name('2030-01-01')],
    });
  });

  it('never touches what is not a backup', () => {
    const now = new Date(2026, 4, 10, 12).getTime();
    const plan = planBackup(['notes.txt', 'lowrider-2026-05-09.db.bak', 'lowrider-x.db'], now, 1);
    expect(plan).toEqual({ create: name('2026-05-10'), remove: [] });
  });
});

describe('making the backup', () => {
  const memoryFs = (files: string[], free = 5e9) => {
    const list = [...files];
    const fs: BackupFs = {
      mkdir: vi.fn(async () => {}),
      freeBytes: vi.fn(async () => free),
      list: vi.fn(async () => [...list]),
      rename: vi.fn(async (from: string, to: string) => {
        const f = from.split('/').pop()!;
        list.splice(list.indexOf(f), 1);
        list.push(to.split('/').pop()!);
      }),
      remove: vi.fn(async (path: string) => {
        const f = path.split('/').pop()!;
        const i = list.indexOf(f);
        if (i >= 0) list.splice(i, 1);
      }),
    };
    return { fs, list };
  };
  const now = new Date(2026, 4, 10, 12).getTime();
  const dbSize = async () => 100e6;

  it('writes to a temporary name and renames it whole; old ones go; the status says what is kept', async () => {
    const { fs, list } = memoryFs([name('2026-05-08'), name('2026-05-09')]);
    const snapshot = vi.fn(async (path: string) => {
      list.push(path.split('/').pop()!);
    });
    const status = await runBackup({ dir: '/b', keep: 2, now, fs, dbSize, snapshot });
    expect(snapshot).toHaveBeenCalledWith(`/b/${name('2026-05-10')}.tmp`);
    expect(fs.rename).toHaveBeenCalledWith(
      `/b/${name('2026-05-10')}.tmp`,
      `/b/${name('2026-05-10')}`,
    );
    expect(fs.remove).toHaveBeenCalledWith(`/b/${name('2026-05-08')}`);
    expect(status).toEqual({ last: name('2026-05-10'), count: 2, error: null });
  });

  it('does not make a second one the same day, and removes an interrupted one – and only that', async () => {
    const { fs } = memoryFs([
      name('2026-05-10'),
      `${name('2026-05-10')}.tmp`,
      // on a stick that is also used for other things
      'notes.tmp',
      'my-thesis-draft.tmp',
      'lowrider-x.db.tmp',
    ]);
    const snapshot = vi.fn();
    const status = await runBackup({ dir: '/b', keep: 7, now, fs, dbSize, snapshot });
    expect(snapshot).not.toHaveBeenCalled();
    expect(fs.remove).toHaveBeenCalledTimes(1);
    expect(fs.remove).toHaveBeenCalledWith(`/b/${name('2026-05-10')}.tmp`);
    expect(status).toEqual({ last: name('2026-05-10'), count: 1, error: null });
  });

  it('keeps the copy it has just made when the clock is behind – and still says all is well', async () => {
    const days = ['10', '11', '12'].map((d) => name(`2026-11-${d}`));
    const { fs, list } = memoryFs(days);
    const snapshot = vi.fn(async (path: string) => {
      list.push(path.split('/').pop()!);
    });
    const behind = new Date(2026, 10, 1, 12).getTime();
    const status = await runBackup({ dir: '/b', keep: 3, now: behind, fs, dbSize, snapshot });
    expect(list.sort()).toEqual([name('2026-11-01'), name('2026-11-11'), name('2026-11-12')]);
    expect(status).toEqual({ last: name('2026-11-12'), count: 3, error: null });
  });

  it('does not begin a copy that would not fit – and says how much is missing', async () => {
    const need = 100e6 * ROOM_FOR_COPY + KEEP_FREE_BYTES;
    const { fs } = memoryFs([name('2026-05-09')], need - 1);
    const snapshot = vi.fn();
    const status = await runBackup({ dir: '/b', keep: 7, now, fs, dbSize, snapshot });
    expect(snapshot).not.toHaveBeenCalled();
    expect(fs.remove).not.toHaveBeenCalled();
    expect(status.error).toMatch(
      /not enough free space.*MB free.*100 MB database.*1000 MB stay free/,
    );
    expect(status).toMatchObject({ last: name('2026-05-09'), count: 1 });
    // exactly enough is enough: the copy and what the recorder needs to go on
    const ok = memoryFs([], need);
    const made = vi.fn(async (path: string) => {
      ok.list.push(path.split('/').pop()!);
    });
    expect(
      (await runBackup({ dir: '/b', keep: 7, now, fs: ok.fs, dbSize, snapshot: made })).error,
    ).toBeNull();
    expect(made).toHaveBeenCalled();
  });

  it('says why it failed and what is there nevertheless – and leaves the older ones alone', async () => {
    const { fs } = memoryFs([name('2026-05-09')]);
    const status = await runBackup({
      dir: '/b',
      keep: 7,
      now,
      fs,
      dbSize,
      snapshot: () => {
        throw new Error('disk full');
      },
    });
    expect(status).toEqual({ last: name('2026-05-09'), count: 1, error: 'disk full' });
    expect(fs.remove).not.toHaveBeenCalled();
    // a failure that is not an Error, and a folder that cannot be listed at all
    const broken: BackupFs = {
      ...fs,
      mkdir: async () => {
        throw 'no way';
      },
      list: async () => {
        throw new Error('gone');
      },
    };
    expect(
      await runBackup({ dir: '/b', keep: 7, now, fs: broken, dbSize, snapshot: vi.fn() }),
    ).toEqual({
      last: null,
      count: 0,
      error: 'no way',
    });
  });
});

describe('the reason a failed copy gives', () => {
  it('is its error line – not the script, the stack, the paths or the version of Node', () => {
    const stderr = [
      '[eval]:1',
      "const { DatabaseSync } = require('node:sqlite'); … /var/lib/lowrider/live.db",
      '                                                      ^',
      '',
      'Error: output file already exists',
      '    at [eval]:1:122',
      '    at runScriptInThisContext (node:internal/vm:209:10)',
      '',
      'Node.js v22.23.5',
    ].join('\n');
    expect(reasonOf(stderr)).toBe('output file already exists');
    expect(reasonOf('SqliteError [ERR_SQLITE_ERROR]: unable to open database file\n at x')).toBe(
      'unable to open database file',
    );
    expect(reasonOf('')).toBeNull();
    expect(reasonOf('Node.js v22.23.5\nsomething else')).toBeNull();
  });
});

describe('a snapshot of the real database', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('is a whole copy that opens on its own and holds what was stored', () => {
    dir = mkdtempSync(join(tmpdir(), 'lowrider-backup-'));
    const store = new Store(join(dir, 'live.db'));
    store.put('tools', 't1', { id: 't1', n: 1 });
    store.putJob('a.nc', new TextEncoder().encode('G0 X1'));
    const copy = join(dir, 'copy.db');
    store.snapshot(copy);
    // the live one goes on being written to
    store.put('tools', 't2', { id: 't2' });
    store.close();
    const restored = new Store(copy);
    expect(restored.list('tools').map((d) => d.id)).toEqual(['t1']);
    expect(restored.listJobs().map((j) => j.name)).toEqual(['a.nc']);
    restored.close();
  });
});

describe('the copy made by a process of its own', () => {
  let dir = '';
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('opens the live database itself, copies it whole – and reports a failure with its reason', async () => {
    dir = mkdtempSync(join(tmpdir(), 'lowrider-child-'));
    const live = join(dir, 'live.db');
    const store = new Store(live);
    store.put('tools', 't1', { id: 't1' });
    // the live one keeps being written to while the child copies
    const copy = join(dir, 'copy.db');
    const done = snapshotInChild(live, copy);
    store.put('tools', 't2', { id: 't2' });
    await done;
    store.close();
    const restored = new Store(copy);
    expect(restored.list('tools').map((d) => d.id)).toContain('t1');
    restored.close();
    // a target that exists is refused by SQLite: the reason comes back, and only the reason
    const refused = await snapshotInChild(live, copy).catch((e: Error) => e);
    expect(refused).toBeInstanceOf(Error);
    expect((refused as Error).message).toMatch(/already exists|output file/i);
    expect((refused as Error).message).not.toMatch(/DatabaseSync|node:sqlite|Node\.js v|\n/);
    // a folder that is not there
    await expect(
      snapshotInChild(join(dir, 'nothing', 'x.db'), join(dir, 'z.db')),
    ).rejects.toThrow();
  });
});

describe('the copy before an update', () => {
  /** A folder in memory: the names in it, free bytes, and what was done. */
  function memory(initial: string[] = [], free = 50e9) {
    const names = new Set(initial);
    const fs: BackupFs = {
      mkdir: async () => {},
      freeBytes: async () => free,
      list: async () => [...names],
      rename: async (from, to) => {
        names.delete(from.split('/').pop()!);
        names.add(to.split('/').pop()!);
      },
      remove: async (path) => void names.delete(path.split('/').pop()!),
    };
    return { names, fs };
  }
  const now = new Date(2026, 10, 24, 15, 8, 1).getTime();
  const made = (m: ReturnType<typeof memory>) =>
    vi.fn((path: string) => void m.names.add(path.split('/').pop()!));

  it('is made now – even where today’s daily copy exists – under a name of its own, and the last two stay', async () => {
    const m = memory([
      name('2026-11-24'),
      'lowrider-update-20261120100000.db',
      'lowrider-update-20261121100000.db',
      'lowrider-update-20261122100000.db',
    ]);
    const snapshot = made(m);
    const done = await runUpdateBackup({
      dir: '/b',
      now,
      fs: m.fs,
      dbSize: async () => 1e6,
      snapshot,
    });
    expect(done).toEqual({ ok: true, name: 'lowrider-update-20261124150801.db' });
    expect(snapshot).toHaveBeenCalledWith('/b/lowrider-update-20261124150801.db.tmp');
    // the daily copies are not its business, and only the newest two of its own remain
    expect([...m.names].sort()).toEqual([
      name('2026-11-24'),
      'lowrider-update-20261122100000.db',
      'lowrider-update-20261124150801.db',
    ]);
    // the daily plan never takes one of them for its own
    expect(planBackup(['lowrider-update-20261124150801.db'], now, 7).remove).toEqual([]);
  });

  it('is not begun where it would not fit – and says so; a leftover of an interrupted copy goes', async () => {
    const m = memory(['lowrider-update-20261124150000.db.tmp'], 1e9);
    const snapshot = made(m);
    const done = await runUpdateBackup({
      dir: '/b',
      now,
      fs: m.fs,
      dbSize: async () => 1e9,
      snapshot,
    });
    expect(done.ok).toBe(false);
    expect(done).toMatchObject({ reason: expect.stringContaining('not enough free space') });
    expect(snapshot).not.toHaveBeenCalled();
    expect([...m.names]).toEqual([]);
  });

  it('says why when the copy itself fails, whatever it throws', async () => {
    const m = memory();
    const failing = await runUpdateBackup({
      dir: '/b',
      now,
      fs: m.fs,
      dbSize: async () => 1,
      snapshot: async () => {
        throw new Error('the copy took too long');
      },
    });
    expect(failing).toEqual({ ok: false, reason: 'the copy took too long' });
    const odd = await runUpdateBackup({
      dir: '/b',
      now,
      fs: m.fs,
      dbSize: async () => 1,
      snapshot: async () => {
        throw 'a text';
      },
    });
    expect(odd).toEqual({ ok: false, reason: 'a text' });
  });
});
