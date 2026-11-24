import os from 'node:os';
import { createEmptyState } from '../../../shared/defaults';
import { buildDashboard, buildExpensesCsv, buildProjectionCsv, NotFoundError } from '../../../shared/queries';
import { createSeedState } from '../../../shared/seed';
import { AppState, DashboardData, Settings, SystemInfo } from '../../../shared/types';
import { schemaVersion } from '../db/connection';
import { BadRequestError } from '../lib/errors';
import { appStateSchema } from '../validation/schemas';
import { BackupService } from './backup.service';
import { ServiceContext } from './context';

/** Display/behaviour preferences kept when data is reset or erased. */
const PRESERVED_SETTINGS: (keyof Settings)[] = [
  'currencyCode',
  'locale',
  'dateFormat',
  'theme',
  'cutoffDays',
  'defaultWeekendRule',
  'upcomingHorizonMonths',
  'lanAccess',
  'setupComplete',
];

function pick(settings: Settings, keys: (keyof Settings)[]): Partial<Settings> {
  const out: Partial<Settings> = {};
  for (const k of keys) (out as Record<string, unknown>)[k] = settings[k];
  return out;
}

export class DataService {
  constructor(
    private readonly ctx: ServiceContext,
    private readonly backups: BackupService
  ) {}

  private get m() {
    return this.ctx.models;
  }

  dashboard(): DashboardData {
    return buildDashboard(this.m.loadState(), this.ctx.today());
  }

  exportJson(): string {
    return JSON.stringify(this.m.loadState(), null, 2);
  }

  /** Replaces all data with a JSON backup exported from this app. */
  importJson(raw: unknown): AppState {
    const parsed = appStateSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new BadRequestError(
        `Invalid Ledgerity backup file${first ? ` (${first.path.join('.')}: ${first.message})` : ''}`
      );
    }
    return this.replaceAll(parsed.data as unknown as AppState);
  }

  resetDemo(): AppState {
    const current = this.m.settings.get();
    const seed = createSeedState(this.ctx.today());
    // Network and theme are machine preferences, not demo content
    return this.replaceAll({
      ...seed,
      settings: { ...seed.settings, lanAccess: current.lanAccess, theme: current.theme, setupComplete: true },
    });
  }

  /** Erases all data, keeping display preferences. */
  clearAll(): AppState {
    return this.replaceAll(createEmptyState(pick(this.m.settings.get(), PRESERVED_SETTINGS)));
  }

  private replaceAll(state: AppState): AppState {
    // Safety copy first, unless there is nothing worth keeping (e.g. the first-run welcome)
    const current = this.m.loadState();
    const hasData =
      current.expenses.length > 0 || current.payments.length > 0 || current.projections.length > 0;
    if (hasData) this.backups.create('pre-restore');
    this.m.replaceState(state);
    return this.m.loadState();
  }

  expensesCsv(): string {
    return buildExpensesCsv(this.m.loadState());
  }

  projectionCsv(id: string): string {
    const state = this.m.loadState();
    if (!state.projections.some((p) => p.id === id)) throw new NotFoundError('Projection');
    return buildProjectionCsv(state, id, this.ctx.today());
  }

  systemInfo(): SystemInfo {
    const { config } = this.ctx;
    const lanUrls: string[] = [];
    if (config.lanAccessActive) {
      for (const addrs of Object.values(os.networkInterfaces())) {
        for (const a of addrs ?? []) {
          if (a.family === 'IPv4' && !a.internal) lanUrls.push(`http://${a.address}:${config.port}`);
        }
      }
    }
    return {
      version: config.version,
      schemaVersion: schemaVersion(this.ctx.db),
      dataDir: config.dataDir,
      databaseFile: this.ctx.db.file,
      port: config.port,
      lanAccess: this.m.settings.get().lanAccess,
      lanAccessActive: config.lanAccessActive,
      lanUrls,
      localUrl: `http://localhost:${config.port}`,
    };
  }
}
