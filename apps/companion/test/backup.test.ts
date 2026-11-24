import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  backupName,
  planBackup,
  ROOM_FOR_COPY,
  runBackup,
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

  it('never touches what is not a backup', () => {
    const now = new Date(2026, 4, 10, 12).getTime();
    const plan = planBackup(['notes.txt', 'lowrider-2026-05-09.db.bak', 'lowrider-x.db'], now, 1);
    expect(plan).toEqual({ create: name('2026-05-10'), remove: [] });
  });
});

describe('making the backup', () => {
  const memoryFs = (files: string[], free = 1e9) => {
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

  it('does not make a second one the same day, and removes an interrupted one', async () => {
    const { fs } = memoryFs([name('2026-05-10'), `${name('2026-05-10')}.tmp`]);
    const snapshot = vi.fn();
    const status = await runBackup({ dir: '/b', keep: 7, now, fs, dbSize, snapshot });
    expect(snapshot).not.toHaveBeenCalled();
    expect(fs.remove).toHaveBeenCalledWith(`/b/${name('2026-05-10')}.tmp`);
    expect(status).toEqual({ last: name('2026-05-10'), count: 1, error: null });
  });

  it('does not begin a copy that would not fit – and says how much is missing', async () => {
    const { fs } = memoryFs([name('2026-05-09')], 100e6 * ROOM_FOR_COPY - 1);
    const snapshot = vi.fn();
    const status = await runBackup({ dir: '/b', keep: 7, now, fs, dbSize, snapshot });
    expect(snapshot).not.toHaveBeenCalled();
    expect(fs.remove).not.toHaveBeenCalled();
    expect(status.error).toMatch(/not enough free space.*MB free.*100 MB database/);
    expect(status).toMatchObject({ last: name('2026-05-09'), count: 1 });
    // exactly enough is enough
    const ok = memoryFs([], 100e6 * ROOM_FOR_COPY);
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
    // a target that exists is refused by SQLite: the reason comes back
    await expect(snapshotInChild(live, copy)).rejects.toThrow(/already exists|output file/i);
    // a database that is not there is no database: nothing is made
    await expect(
      snapshotInChild(join(dir, 'nothing', 'x.db'), join(dir, 'z.db')),
    ).rejects.toThrow();
  });
});
