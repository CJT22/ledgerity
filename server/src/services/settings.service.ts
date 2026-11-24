import { z } from 'zod';
import { Settings } from '../../../shared/types';
import { settingsPatchSchema } from '../validation/schemas';
import { ServiceContext } from './context';

type Input<S extends z.ZodType> = z.output<S>;

export class SettingsService {
  constructor(private readonly ctx: ServiceContext) {}

  get(): Settings {
    return this.ctx.models.settings.get();
  }

  update(patch: Input<typeof settingsPatchSchema>): Settings {
    if (patch.cutoffDays) {
      patch = { ...patch, cutoffDays: [...new Set(patch.cutoffDays)].sort((a, b) => a - b) };
    }
    this.ctx.models.settings.set(patch as Partial<Settings>);
    return this.get();
  }
}
