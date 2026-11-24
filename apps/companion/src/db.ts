import { DatabaseSync } from 'node:sqlite';

/**
 * Everything the companion keeps, in one SQLite file: library documents
 * (tools, materials, zeros, …) as JSON, buffered job files and settings.
 */
export interface StoredDocument {
  id: string;
  data: unknown;
  updatedAt: number;
}

export interface StoredJob {
  name: string;
  size: number;
  uploadedAt: number;
}

export class Store {
  private readonly db: DatabaseSync;

  constructor(path = ':memory:') {
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS documents (
        collection TEXT NOT NULL,
        id TEXT NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, id)
      );
      CREATE TABLE IF NOT EXISTS jobs (
        name TEXT PRIMARY KEY,
        content BLOB NOT NULL,
        uploaded_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  list(collection: string): StoredDocument[] {
    const rows = this.db
      .prepare(
        'SELECT id, data, updated_at FROM documents WHERE collection = ? ORDER BY updated_at, id',
      )
      .all(collection) as { id: string; data: string; updated_at: number }[];
    return rows.map((r) => ({ id: r.id, data: JSON.parse(r.data), updatedAt: r.updated_at }));
  }

  get(collection: string, id: string): StoredDocument | null {
    const r = this.db
      .prepare('SELECT id, data, updated_at FROM documents WHERE collection = ? AND id = ?')
      .get(collection, id) as { id: string; data: string; updated_at: number } | undefined;
    return r ? { id: r.id, data: JSON.parse(r.data), updatedAt: r.updated_at } : null;
  }

  count(collection: string): number {
    const row = this.db
      .prepare('SELECT COUNT(*) AS n FROM documents WHERE collection = ?')
      .get(collection) as { n: number | bigint };
    return Number(row.n);
  }

  put(collection: string, id: string, data: unknown, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO documents (collection, id, data, updated_at) VALUES (?, ?, ?, ?)
         ON CONFLICT (collection, id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`,
      )
      .run(collection, id, JSON.stringify(data), now);
  }

  delete(collection: string, id: string): boolean {
    return (
      Number(
        this.db.prepare('DELETE FROM documents WHERE collection = ? AND id = ?').run(collection, id)
          .changes,
      ) > 0
    );
  }

  /** Several writes in one transaction (imports). */
  transaction(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  listJobs(): StoredJob[] {
    const rows = this.db
      .prepare(
        'SELECT name, length(content) AS size, uploaded_at FROM jobs ORDER BY uploaded_at DESC, name',
      )
      .all() as { name: string; size: number; uploaded_at: number }[];
    return rows.map((r) => ({ name: r.name, size: r.size, uploadedAt: r.uploaded_at }));
  }

  putJob(name: string, content: Uint8Array, now = Date.now()): void {
    this.db
      .prepare(
        `INSERT INTO jobs (name, content, uploaded_at) VALUES (?, ?, ?)
         ON CONFLICT (name) DO UPDATE SET content = excluded.content, uploaded_at = excluded.uploaded_at`,
      )
      .run(name, content, now);
  }

  getJob(name: string): Uint8Array | null {
    const r = this.db.prepare('SELECT content FROM jobs WHERE name = ?').get(name) as
      | { content: Uint8Array }
      | undefined;
    return r ? r.content : null;
  }

  deleteJob(name: string): boolean {
    return Number(this.db.prepare('DELETE FROM jobs WHERE name = ?').run(name).changes) > 0;
  }

  getSetting<T>(key: string, fallback: T): T {
    const r = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return r ? (JSON.parse(r.value) as T) : fallback;
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
      )
      .run(key, JSON.stringify(value));
  }

  /**
   * A consistent copy of the whole database in one file (`VACUUM INTO`): also while it is being
   * written to, and compacted. The target must not exist yet.
   */
  snapshot(path: string): void {
    this.db.prepare('VACUUM INTO ?').run(path);
  }

  close(): void {
    this.db.close();
  }
}
