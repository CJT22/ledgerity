/**
 * Controllers: translate HTTP <-> service calls. Validate input, call one service method,
 * shape the response. No business rules here.
 */
import type { Request, Response } from 'express';
import { z } from 'zod';
import { Services } from '../services';
import {
  affordabilitySchema,
  chargeCreateSchema,
  checkpointCreateSchema,
  duplicateSchema,
  exclusionSchema,
  expenseCreateSchema,
  expensePatchSchema,
  itemCreateSchema,
  itemPatchSchema,
  overrideSchema,
  partCreateSchema,
  partPatchSchema,
  paymentCreateSchema,
  paymentPatchSchema,
  planCreateSchema,
  planPatchSchema,
  projectionCreateSchema,
  projectionPatchSchema,
  settingsPatchSchema,
} from '../validation/schemas';

type Handler = (req: Request, res: Response) => void;

const parse = <S extends z.ZodType>(schema: S, data: unknown): z.output<S> => schema.parse(data ?? {});
const param = (req: Request, name: string): string => String(req.params[name]);
const noContent = (res: Response) => res.status(204).end();

function sendCsv(res: Response, fileName: string, csv: string) {
  res
    .type('text/csv; charset=utf-8')
    .attachment(fileName)
    // BOM so Excel detects UTF-8 (₱ and other symbols)
    .send(`﻿${csv}`);
}

export function createControllers(s: Services) {
  const settings = {
    get: ((_req, res) => res.json(s.settings.get())) as Handler,
    update: ((req, res) => res.json(s.settings.update(parse(settingsPatchSchema, req.body)))) as Handler,
  };

  const expenses = {
    list: ((_req, res) => res.json(s.expenses.list())) as Handler,
    get: ((req, res) => res.json(s.expenses.get(param(req, 'id')))) as Handler,
    create: ((req, res) =>
      res.status(201).json(s.expenses.create(parse(expenseCreateSchema, req.body)))) as Handler,
    update: ((req, res) =>
      res.json(s.expenses.update(param(req, 'id'), parse(expensePatchSchema, req.body)))) as Handler,
    delete: ((req, res) => {
      s.expenses.delete(param(req, 'id'));
      noContent(res);
    }) as Handler,

    createPart: ((req, res) =>
      res.status(201).json(s.expenses.createPart(parse(partCreateSchema, req.body)))) as Handler,
    updatePart: ((req, res) =>
      res.json(s.expenses.updatePart(param(req, 'id'), parse(partPatchSchema, req.body)))) as Handler,
    deletePart: ((req, res) => {
      s.expenses.deletePart(param(req, 'id'));
      noContent(res);
    }) as Handler,

    createPlan: ((req, res) =>
      res.status(201).json(s.expenses.createPlan(parse(planCreateSchema, req.body)))) as Handler,
    updatePlan: ((req, res) =>
      res.json(s.expenses.updatePlan(param(req, 'id'), parse(planPatchSchema, req.body)))) as Handler,
    deletePlan: ((req, res) => {
      s.expenses.deletePlan(param(req, 'id'));
      noContent(res);
    }) as Handler,
    addCharge: ((req, res) =>
      res.status(201).json(s.expenses.addCharge(param(req, 'id'), parse(chargeCreateSchema, req.body)))) as Handler,
    deleteCharge: ((req, res) =>
      res.json(s.expenses.deleteCharge(param(req, 'id'), param(req, 'chargeId')))) as Handler,

    logPayment: ((req, res) =>
      res.status(201).json(s.expenses.logPayment(parse(paymentCreateSchema, req.body)))) as Handler,
    updatePayment: ((req, res) =>
      res.json(s.expenses.updatePayment(param(req, 'id'), parse(paymentPatchSchema, req.body)))) as Handler,
    deletePayment: ((req, res) => {
      s.expenses.deletePayment(param(req, 'id'));
      noContent(res);
    }) as Handler,
  };

  const projections = {
    list: ((_req, res) => res.json(s.projections.list())) as Handler,
    get: ((req, res) => res.json(s.projections.get(param(req, 'id')))) as Handler,
    run: ((req, res) => res.json(s.projections.run(param(req, 'id')))) as Handler,
    compare: ((req, res) => {
      const ids = String(req.query.ids ?? '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 10);
      res.json(s.projections.compare(ids));
    }) as Handler,
    create: ((req, res) =>
      res.status(201).json(s.projections.create(parse(projectionCreateSchema, req.body)))) as Handler,
    update: ((req, res) =>
      res.json(s.projections.update(param(req, 'id'), parse(projectionPatchSchema, req.body)))) as Handler,
    delete: ((req, res) => {
      s.projections.delete(param(req, 'id'));
      noContent(res);
    }) as Handler,
    duplicate: ((req, res) =>
      res
        .status(201)
        .json(s.projections.duplicate(param(req, 'id'), parse(duplicateSchema, req.body).name))) as Handler,
    affordability: ((req, res) =>
      res.json(s.projections.affordability(parse(affordabilitySchema, req.body)))) as Handler,

    createItem: ((req, res) =>
      res.status(201).json(s.projections.createItem(parse(itemCreateSchema, req.body)))) as Handler,
    updateItem: ((req, res) =>
      res.json(s.projections.updateItem(param(req, 'id'), parse(itemPatchSchema, req.body)))) as Handler,
    deleteItem: ((req, res) => {
      s.projections.deleteItem(param(req, 'id'));
      noContent(res);
    }) as Handler,

    upsertOverride: ((req, res) =>
      res.json(s.projections.upsertOverride(parse(overrideSchema, req.body)))) as Handler,
    deleteOverride: ((req, res) => {
      s.projections.deleteOverride(param(req, 'itemId'), param(req, 'originalDate'));
      noContent(res);
    }) as Handler,
    toggleExclusion: ((req, res) =>
      res.json({ excluded: s.projections.toggleExclusion(parse(exclusionSchema, req.body)) })) as Handler,
    createCheckpoint: ((req, res) =>
      res.status(201).json(s.projections.createCheckpoint(parse(checkpointCreateSchema, req.body)))) as Handler,
    deleteCheckpoint: ((req, res) => {
      s.projections.deleteCheckpoint(param(req, 'id'));
      noContent(res);
    }) as Handler,
  };

  const data = {
    dashboard: ((_req, res) => res.json(s.data.dashboard())) as Handler,
    exportJson: ((_req, res) => res.type('application/json').send(s.data.exportJson())) as Handler,
    importJson: ((req, res) => res.json(s.data.importJson(req.body))) as Handler,
    expensesCsv: ((_req, res) => sendCsv(res, 'ledgerity-expenses.csv', s.data.expensesCsv())) as Handler,
    projectionCsv: ((req, res) =>
      sendCsv(res, 'ledgerity-projection.csv', s.data.projectionCsv(param(req, 'id')))) as Handler,
    resetDemo: ((_req, res) => res.json(s.data.resetDemo())) as Handler,
    clearAll: ((_req, res) => res.json(s.data.clearAll())) as Handler,
    systemInfo: ((_req, res) => res.json(s.data.systemInfo())) as Handler,
  };

  const backups = {
    list: ((_req, res) => res.json(s.backups.list())) as Handler,
    create: ((_req, res) => {
      const info = s.backups.create('manual');
      if (!info) {
        res.status(400).json({ error: 'Backups are not available for in-memory databases' });
        return;
      }
      res.status(201).json(info);
    }) as Handler,
    restore: ((req, res) => {
      s.backups.restore(param(req, 'fileName'));
      noContent(res);
    }) as Handler,
    download: ((req, res) => res.download(s.backups.resolve(param(req, 'fileName')))) as Handler,
  };

  return { settings, expenses, projections, data, backups };
}
