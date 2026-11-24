import { randomUUID } from 'node:crypto';

/** Readable, sortable-ish ids in the same style as the frontend demo (e.g. `exp_m3k9x2_a1b2c3d4`). */
export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
}

/**
 * Applies a validated PATCH body onto an existing record. `null` in the patch means
 * "clear this field"; the models persist it as NULL and read it back as absent.
 */
export function applyPatch<T extends object>(existing: T, patch: object): T {
  const out: Record<string, unknown> = { ...(existing as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

/** Casts a validated create body (which may contain nulls for absent optionals) to a domain type. */
export function withId<T>(data: object, id: string): T {
  return { ...data, id } as T;
}
