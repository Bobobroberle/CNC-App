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

/**
 * Makes today's backup if it is due and tidies up. The snapshot goes to a temporary name and
 * is renamed when whole, so a power cut leaves no half file that looks like a backup.
 */
export async function runBackup(opts: {
  dir: string;
  keep: number;
  now: number;
  fs: BackupFs;
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
