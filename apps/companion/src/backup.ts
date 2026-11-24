import { execFile } from 'node:child_process';

/**
 * The automatic backup of the companion's database (tools, materials, zeros, history, jobs …): one
 * snapshot a day (`VACUUM INTO`), the last few kept. Pure planning here; what touches a disk is
 * handed in, so the rules are tested without one.
 *
 * It protects against a damaged or wrongly emptied database – not against the card dying, when
 * the folder lies on the same card: for that `LOWRIDER_BACKUP_DIR` belongs on a second medium.
 */

export interface BackupFs {
  mkdir(dir: string): Promise<void>;
  /** Bytes free on the disk the folder lies on */
  freeBytes(dir: string): Promise<number>;
  /** The names in a folder (none for a folder that is not there) */
  list(dir: string): Promise<string[]>;
  rename(from: string, to: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export interface BackupStatus {
  /** The newest backup's file name; null while there is none */
  last: string | null;
  /** How many are kept */
  count: number;
  /** When the last attempt failed, why (cleared by the next that works) */
  error: string | null;
}

const NAME = /^lowrider-(\d{4}-\d{2}-\d{2})\.db$/;

/** The file name of the backup of a day (local time: "today" is the workshop's today). */
export function backupName(at: number): string {
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `lowrider-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.db`;
}

/**
 * What to do with the backups that lie in the folder: make today's unless it is there, and delete
 * the oldest beyond `keep`. Files that are not backups are never touched.
 */
export function planBackup(
  existing: readonly string[],
  now: number,
  keep: number,
): { create: string | null; remove: string[] } {
  const today = backupName(now);
  const mine = existing.filter((n) => NAME.test(n));
  const create = mine.includes(today) ? null : today;
  const all = [...mine, ...(create ? [create] : [])].sort();
  const surplus = Math.max(0, all.length - Math.max(1, keep));
  // Never the one that is just made (the newest name sorts last)
  return { create, remove: all.slice(0, surplus) };
}

/** What a copy needs beyond the database's own size: the copy is compacted, but never smaller than the data. */
export const ROOM_FOR_COPY = 1.25;

/**
 * Makes today's backup if it is due and tidies up. The snapshot goes to a temporary name and
 * is renamed when whole, so a power cut leaves no half file that looks like a backup. A copy
 * that would not fit is not begun: seven copies must never fill the card the live database and
 * the recordings share.
 */
export async function runBackup(opts: {
  dir: string;
  keep: number;
  now: number;
  fs: BackupFs;
  /** Size of the live database, bytes */
  dbSize: () => Promise<number>;
  snapshot: (path: string) => void | Promise<void>;
}): Promise<BackupStatus> {
  const { dir, keep, now, fs, snapshot } = opts;
  try {
    await fs.mkdir(dir);
    const names = await fs.list(dir);
    // A leftover of an interrupted run is not a backup: it goes.
    for (const name of names) if (name.endsWith('.tmp')) await fs.remove(`${dir}/${name}`);
    const plan = planBackup(names, now, keep);
    if (plan.create) {
      const [need, free] = [await opts.dbSize(), await fs.freeBytes(dir)];
      if (free < need * ROOM_FOR_COPY) {
        throw new Error(
          `not enough free space for a copy (${Math.round(free / 1e6)} MB free, ${Math.round(need / 1e6)} MB database)`,
        );
      }
      const tmp = `${dir}/${plan.create}.tmp`;
      await snapshot(tmp);
      await fs.rename(tmp, `${dir}/${plan.create}`);
    }
    for (const name of plan.remove) await fs.remove(`${dir}/${name}`);
    const kept = (await fs.list(dir)).filter((n) => NAME.test(n)).sort();
    return { last: kept.at(-1) ?? null, count: kept.length, error: null };
  } catch (error) {
    const kept = await fs
      .list(dir)
      .then((names) => names.filter((n) => NAME.test(n)).sort())
      .catch(() => [] as string[]);
    return {
      last: kept.at(-1) ?? null,
      count: kept.length,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Makes the copy in a process of its own: a copy of a database that holds job files takes seconds on
 * a card, and the companion also relays PAUSE, jog stop and NOT-HALT – nothing may make those wait.
 * The child opens the database itself (WAL lets it read while the companion writes).
 */
export function snapshotInChild(dbPath: string, target: string): Promise<void> {
  const script =
    "const { DatabaseSync } = require('node:sqlite');" +
    'const db = new DatabaseSync(process.argv[1]);' +
    "db.prepare('VACUUM INTO ?').run(process.argv[2]);" +
    'db.close();';
  return new Promise((done, fail) => {
    execFile(
      process.execPath,
      [...process.execArgv, '-e', script, dbPath, target],
      { timeout: 10 * 60_000 },
      (error, _out, stderr) => (error ? fail(new Error(stderr.trim() || error.message)) : done()),
    );
  });
}
