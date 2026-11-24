import os from 'node:os';
import { createEmptyState } from '../../shared/defaults';
import { todayISODate } from '../../shared/domain';
import { createApp } from './app';
import { loadConfig } from './config';
import { Db } from './db/connection';
import { Models } from './models';

const config = loadConfig();
const db = new Db(config.dbFile);
const models = new Models(db);

// First run: an empty workspace. The app shows a welcome screen offering
// "Start fresh" or "Explore with demo data" (settings.setupComplete = false).
const isFresh = db.get<{ n: number }>('SELECT COUNT(*) AS n FROM settings')!.n === 0;
if (isFresh) {
  models.replaceState(createEmptyState());
  console.log('[ledgerity] New database created.');
}

const lanAccess = models.settings.get().lanAccess;
config.lanAccessActive = lanAccess;
const host = lanAccess ? '0.0.0.0' : '127.0.0.1';

const { app, services } = createApp({ db, models, config, today: todayISODate });

try {
  const auto = services.backups.autoDaily();
  if (auto) console.log(`[ledgerity] Daily backup saved: ${auto.fileName}`);
} catch (err) {
  console.warn('[ledgerity] Daily backup failed:', err);
}

const server = app.listen(config.port, host, () => {
  const lines = [`Ledgerity API ${config.version} running`, `  Database:  ${config.dbFile}`];
  if (config.serveClient) {
    lines.push(`  Open:      http://localhost:${config.port}`);
    if (lanAccess) {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
          if (a.family === 'IPv4' && !a.internal) lines.push(`  Phone:     http://${a.address}:${config.port}`);
        }
      }
    } else {
      lines.push('  Phone access is off (Settings → Phone access).');
    }
  } else {
    lines.push(`  API:       http://localhost:${config.port}/api/v1  (UI: http://localhost:5173)`);
  }
  console.log(lines.join('\n'));
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(
      `[ledgerity] Port ${config.port} is already in use. Is Ledgerity already running in another window?\n` +
        `            Close it, or start with a different port: set LEDGERITY_PORT=5180`
    );
  } else {
    console.error('[ledgerity] Server error:', err);
  }
  process.exit(1);
});

function shutdown() {
  server.close();
  try {
    db.close();
  } catch {
    // already closed
  }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
