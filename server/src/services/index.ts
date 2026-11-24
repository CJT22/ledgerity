import { BackupService } from './backup.service';
import { ServiceContext } from './context';
import { DataService } from './data.service';
import { ExpensesService } from './expenses.service';
import { ProjectionsService } from './projections.service';
import { SettingsService } from './settings.service';

export type { ServiceContext } from './context';

export function createServices(ctx: ServiceContext) {
  const backups = new BackupService(ctx);
  return {
    settings: new SettingsService(ctx),
    expenses: new ExpensesService(ctx),
    projections: new ProjectionsService(ctx),
    backups,
    data: new DataService(ctx, backups),
  };
}

export type Services = ReturnType<typeof createServices>;
