import fs from 'node:fs';
import path from 'node:path';

export interface AppConfig {
  version: string;
  port: number;
  /** Folder holding the database and backups. */
  dataDir: string;
  /** SQLite file path, or ':memory:' (tests). */
  dbFile: string;
  backupsDir: string;
  /** Serve the built frontend from dist/client. */
  serveClient: boolean;
  clientDistDir: string;
  /** Number of daily automatic backups to keep. */
  autoBackupKeep: number;
  /** Whether this process is listening on all network interfaces. */
  lanAccessActive: boolean;
}

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

function readVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
    return String(pkg.version ?? '0.0.0');
  } catch {
    return '0.0.0';
  }
}

export function loadConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  const dataDir = path.resolve(process.env.LEDGERITY_DATA_DIR ?? path.join(projectRoot, 'data'));
  return {
    version: readVersion(),
    port: Number(process.env.LEDGERITY_PORT ?? 5174),
    dataDir,
    dbFile: path.join(dataDir, 'ledgerity.sqlite'),
    backupsDir: path.join(dataDir, 'backups'),
    serveClient: process.argv.includes('--production'),
    clientDistDir: path.join(projectRoot, 'dist', 'client'),
    autoBackupKeep: 14,
    lanAccessActive: false,
    ...overrides,
  };
}
