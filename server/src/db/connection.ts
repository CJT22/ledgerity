import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { migrations } from './migrations';

export type SqlValue = string | number | null;

function openConnection(file: string): DatabaseSync {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new DatabaseSync(file);
  conn.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
  `);
  if (file !== ':memory:') conn.exec('PRAGMA journal_mode = WAL;');
  return conn;
}

/**
 * Thin wrapper around node:sqlite with nested-safe transactions and the ability to
 * reopen the file (needed when restoring a backup over the live database).
 */
export class Db {
  private _conn: DatabaseSync;
  private txDepth = 0;

  constructor(public readonly file: string) {
    this._conn = openConnection(file);
    migrate(this);
  }

  get conn(): DatabaseSync {
    return this._conn;
  }

  all<T = Record<string, SqlValue>>(sql: string, ...params: SqlValue[]): T[] {
    return this._conn.prepare(sql).all(...params) as T[];
  }

  get<T = Record<string, SqlValue>>(sql: string, ...params: SqlValue[]): T | undefined {
    return this._conn.prepare(sql).get(...params) as T | undefined;
  }

  run(sql: string, ...params: SqlValue[]): { changes: number } {
    const r = this._conn.prepare(sql).run(...params);
    return { changes: Number(r.changes) };
  }

  exec(sql: string): void {
    this._conn.exec(sql);
  }

  /** Runs fn in a transaction. Nested calls join the outer transaction. */
  transaction<T>(fn: () => T): T {
    if (this.txDepth > 0) {
      this.txDepth++;
      try {
        return fn();
      } finally {
        this.txDepth--;
      }
    }
    this._conn.exec('BEGIN IMMEDIATE');
    this.txDepth = 1;
    try {
      const result = fn();
      this._conn.exec('COMMIT');
      return result;
    } catch (err) {
      this._conn.exec('ROLLBACK');
      throw err;
    } finally {
      this.txDepth = 0;
    }
  }

  /** Consistent point-in-time copy of the database to `target` (must not exist). */
  snapshotTo(target: string): void {
    this._conn.prepare('VACUUM INTO ?').run(target);
  }

  close(): void {
    if (this.file !== ':memory:') {
      try {
        this._conn.exec('PRAGMA wal_checkpoint(TRUNCATE);');
      } catch {
        // best effort
      }
    }
    this._conn.close();
  }

  /** Close, let `replaceFile` swap the file on disk, then reopen and migrate. */
  reopenWith(replaceFile: () => void): void {
    this.close();
    try {
      replaceFile();
    } finally {
      this._conn = openConnection(this.file);
      migrate(this);
    }
  }
}

export function migrate(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );
  `);
  const applied = new Set(
    db.all<{ version: number }>('SELECT version FROM schema_migrations').map((r) => r.version)
  );
  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.run('INSERT INTO schema_migrations (version, name) VALUES (?, ?)', m.version, m.name);
    });
  }
}

export function schemaVersion(db: Db): number {
  return db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations')?.v ?? 0;
}
