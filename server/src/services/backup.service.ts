import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { BackupInfo } from '../../../shared/types';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { ServiceContext } from './context';

const FILE_RE = /^ledgerity-(auto|manual|pre-restore)-(\d{8}-\d{6})(?:-\d+)?\.sqlite$/;
const PRE_RESTORE_KEEP = 10;

function stamp(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * Point-in-time copies of the SQLite file in data/backups.
 *  - auto:        first launch each day, newest N kept
 *  - manual:      "Backup now" in Settings, never pruned
 *  - pre-restore: taken automatically before any restore/import/reset/erase
 */
export class BackupService {
  constructor(private readonly ctx: ServiceContext) {}

  private get dir() {
    return this.ctx.config.backupsDir;
  }

  private get supported() {
    return this.ctx.db.file !== ':memory:';
  }

  list(): BackupInfo[] {
    if (!this.supported || !fs.existsSync(this.dir)) return [];
    return fs
      .readdirSync(this.dir)
      .map((fileName) => ({ fileName, m: FILE_RE.exec(fileName) }))
      .filter((x): x is { fileName: string; m: RegExpExecArray } => x.m !== null)
      .map(({ fileName, m }) => {
        const st = fs.statSync(path.join(this.dir, fileName));
        return {
          fileName,
          kind: m[1] as BackupInfo['kind'],
          createdAt: st.mtime.toISOString(),
          sizeBytes: st.size,
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.fileName.localeCompare(a.fileName));
  }

  create(kind: BackupInfo['kind'] = 'manual'): BackupInfo | null {
    if (!this.supported) return null;
    fs.mkdirSync(this.dir, { recursive: true });
    const base = `ledgerity-${kind}-${stamp()}`;
    let fileName = `${base}.sqlite`;
    for (let n = 2; fs.existsSync(path.join(this.dir, fileName)); n++) fileName = `${base}-${n}.sqlite`;
    const target = path.join(this.dir, fileName);
    this.ctx.db.snapshotTo(target);
    const st = fs.statSync(target);
    this.prune();
    return { fileName, kind, createdAt: st.mtime.toISOString(), sizeBytes: st.size };
  }

  /** Daily automatic backup; safe to call on every start. */
  autoDaily(): BackupInfo | null {
    if (!this.supported) return null;
    const today = stamp().slice(0, 8);
    const hasToday = this.list().some((b) => b.kind === 'auto' && b.fileName.includes(`-${today}-`));
    return hasToday ? null : this.create('auto');
  }

  private prune(): void {
    const all = this.list();
    const drop = [
      ...all.filter((b) => b.kind === 'auto').slice(this.ctx.config.autoBackupKeep),
      ...all.filter((b) => b.kind === 'pre-restore').slice(PRE_RESTORE_KEEP),
    ];
    for (const b of drop) fs.rmSync(path.join(this.dir, b.fileName), { force: true });
  }

  /** Absolute path of a backup, rejecting anything that is not one of our backup files. */
  resolve(fileName: string): string {
    if (path.basename(fileName) !== fileName || !FILE_RE.test(fileName)) {
      throw new BadRequestError('Invalid backup file name');
    }
    const full = path.join(this.dir, fileName);
    if (!fs.existsSync(full)) throw new NotFoundError('Backup');
    return full;
  }

  /** Replaces the live database with a backup (a pre-restore backup is taken first). */
  restore(fileName: string): void {
    if (!this.supported) throw new BadRequestError('Restore is not available for in-memory databases');
    const source = this.resolve(fileName);
    validateBackupFile(source);
    this.create('pre-restore');
    const dbFile = this.ctx.db.file;
    this.ctx.db.reopenWith(() => {
      for (const suffix of ['-wal', '-shm']) fs.rmSync(dbFile + suffix, { force: true });
      fs.copyFileSync(source, dbFile);
    });
  }
}

/** Opens a candidate file read-only and checks it is a healthy Ledgerity database. */
export function validateBackupFile(file: string): void {
  let conn: DatabaseSync | null = null;
  try {
    conn = new DatabaseSync(file, { readOnly: true });
    const integrity = conn.prepare('PRAGMA integrity_check').get() as { integrity_check?: string };
    if (integrity?.integrity_check !== 'ok') throw new Error('integrity check failed');
    const t = conn
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('schema_migrations', 'expenses')`)
      .all();
    if (t.length < 2) throw new Error('not a Ledgerity database');
  } catch (err) {
    throw new BadRequestError(
      `This file can't be restored: ${err instanceof Error ? err.message : 'unreadable'}`
    );
  } finally {
    conn?.close();
  }
}
