import { AppState, Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  currencyCode: 'PHP',
  locale: 'en-PH',
  dateFormat: 'MMM d, yyyy',
  theme: 'system',
  cutoffDays: [10, 25],
  defaultWeekendRule: 'none',
  upcomingHorizonMonths: 12,
  // Off by default: no login, so other devices on the network are opt-in.
  lanAccess: false,
  setupComplete: false,
};

/** Blank workspace with default settings. */
export function createEmptyState(settings: Partial<Settings> = {}): AppState {
  return {
    version: 2,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    expenses: [],
    parts: [],
    plans: [],
    payments: [],
    projections: [],
    projectionItems: [],
    overrides: [],
    exclusions: [],
    checkpoints: [],
  };
}
