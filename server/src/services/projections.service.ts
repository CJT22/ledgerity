import { z } from 'zod';
import {
  checkAffordabilityForState,
  compareProjections,
  runProjectionById,
} from '../../../shared/queries';
import {
  AffordabilityResult,
  BalanceCheckpoint,
  LinkedExclusion,
  OccurrenceOverride,
  Projection,
  ProjectionComparison,
  ProjectionItem,
  ProjectionResult,
} from '../../../shared/types';
import { BadRequestError, NotFoundError } from '../lib/errors';
import { applyPatch, uid, withId } from '../lib/util';
import {
  affordabilitySchema,
  checkpointCreateSchema,
  exclusionSchema,
  itemCreateSchema,
  itemPatchSchema,
  overrideSchema,
  projectionCreateSchema,
  projectionPatchSchema,
} from '../validation/schemas';
import { ServiceContext } from './context';

type Input<S extends z.ZodType> = z.output<S>;

export class ProjectionsService {
  constructor(private readonly ctx: ServiceContext) {}

  private get m() {
    return this.ctx.models;
  }

  private requireProjection(id: string): Projection {
    const p = this.m.projections.get(id);
    if (!p) throw new NotFoundError('Projection');
    return p;
  }

  private requireItem(id: string): ProjectionItem {
    const it = this.m.items.get(id);
    if (!it) throw new NotFoundError('Projection item');
    return it;
  }

  private checkParent(id: string | null | undefined, selfId?: string): void {
    if (!id) return;
    if (id === selfId) throw new BadRequestError('A projection cannot be its own scenario parent');
    if (!this.m.projections.get(id)) throw new BadRequestError('Parent projection does not exist');
  }

  // ---- Reads --------------------------------------------------------------

  list(): ProjectionResult[] {
    const state = this.m.loadState();
    const today = this.ctx.today();
    return state.projections.map((p) => runProjectionById(state, p.id, today));
  }

  get(id: string): Projection {
    return this.requireProjection(id);
  }

  run(id: string): ProjectionResult {
    return runProjectionById(this.m.loadState(), id, this.ctx.today());
  }

  compare(ids: string[]): ProjectionComparison {
    return compareProjections(this.m.loadState(), ids, this.ctx.today());
  }

  affordability(params: Input<typeof affordabilitySchema>): AffordabilityResult {
    return checkAffordabilityForState(
      this.m.loadState(),
      { ...params, label: params.label ?? undefined },
      this.ctx.today()
    );
  }

  // ---- Projections --------------------------------------------------------

  create(data: Input<typeof projectionCreateSchema>): Projection {
    this.checkParent(data.parentProjectionId);
    const p = withId<Projection>(data, uid('proj'));
    this.m.projections.insert(p);
    return this.m.projections.get(p.id)!;
  }

  update(id: string, patch: Input<typeof projectionPatchSchema>): Projection {
    const updated = applyPatch(this.requireProjection(id), patch);
    if (updated.endDate < updated.startDate) {
      throw new BadRequestError('End date must be on or after the start date');
    }
    if (patch.parentProjectionId !== undefined) this.checkParent(patch.parentProjectionId, id);
    this.m.projections.update(updated);
    return this.m.projections.get(id)!;
  }

  /** Deletes a projection and everything in it; its scenarios become standalone projections. */
  delete(id: string): void {
    this.requireProjection(id);
    this.m.projections.delete(id);
  }

  /** Deep copy (items, overrides, exclusions, checkpoints) as a scenario of the source. */
  duplicate(id: string, newName?: string | null): Projection {
    const src = this.requireProjection(id);
    const copy: Projection = {
      ...src,
      id: uid('proj'),
      name: newName?.trim() || `${src.name} (Scenario)`,
      parentProjectionId: src.id,
    };

    this.ctx.db.transaction(() => {
      this.m.projections.insert(copy);
      const itemMap = new Map<string, string>();
      for (const it of this.m.items.list('projection_id = ?', id)) {
        const newId = uid('item');
        itemMap.set(it.id, newId);
        this.m.items.insert({ ...it, id: newId, projectionId: copy.id });
      }
      for (const [oldItemId, newItemId] of itemMap) {
        for (const ov of this.m.overrides.list('item_id = ?', oldItemId)) {
          this.m.overrides.insert({ ...ov, itemId: newItemId });
        }
      }
      for (const ex of this.m.exclusions.list('projection_id = ?', id)) {
        this.m.exclusions.insert({ ...ex, projectionId: copy.id });
      }
      for (const cp of this.m.checkpoints.list('projection_id = ?', id)) {
        this.m.checkpoints.insert({ ...cp, id: uid('cp'), projectionId: copy.id });
      }
    });
    return this.m.projections.get(copy.id)!;
  }

  // ---- Items --------------------------------------------------------------

  createItem(data: Input<typeof itemCreateSchema>): ProjectionItem {
    this.requireProjection(data.projectionId);
    const item = withId<ProjectionItem>(data, uid('item'));
    this.m.items.insert(item);
    return this.m.items.get(item.id)!;
  }

  updateItem(id: string, patch: Input<typeof itemPatchSchema>): ProjectionItem {
    const updated = applyPatch(this.requireItem(id), patch);
    this.m.items.update(updated);
    return this.m.items.get(id)!;
  }

  deleteItem(id: string): void {
    this.requireItem(id);
    this.m.items.delete(id); // overrides cascade
  }

  // ---- Plan vs actual -----------------------------------------------------

  upsertOverride(data: Input<typeof overrideSchema>): OccurrenceOverride {
    this.requireItem(data.itemId);
    this.m.overrides.upsert(data as OccurrenceOverride);
    return this.m.overrides.get(data.itemId, data.originalDate)!;
  }

  deleteOverride(itemId: string, originalDate: string): void {
    this.m.overrides.delete(itemId, originalDate);
  }

  /** Returns true if the linked due is now excluded, false if it was re-included. */
  toggleExclusion(ex: Input<typeof exclusionSchema>): boolean {
    this.requireProjection(ex.projectionId);
    const key = [ex.projectionId, ex.sourceType, ex.sourceId, ex.occurrenceDate] as const;
    if (this.m.exclusions.get(...key)) {
      this.m.exclusions.delete(...key);
      return false;
    }
    this.m.exclusions.insert(ex as LinkedExclusion);
    return true;
  }

  createCheckpoint(data: Input<typeof checkpointCreateSchema>): BalanceCheckpoint {
    this.requireProjection(data.projectionId);
    const cp = withId<BalanceCheckpoint>(data, uid('cp'));
    this.m.checkpoints.insert(cp);
    return this.m.checkpoints.get(cp.id)!;
  }

  deleteCheckpoint(id: string): void {
    if (!this.m.checkpoints.delete(id)) throw new NotFoundError('Checkpoint');
  }
}
