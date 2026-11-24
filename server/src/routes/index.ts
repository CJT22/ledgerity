import { Router } from 'express';
import { createControllers } from '../controllers';
import { Services } from '../services';

/** URL -> controller wiring for /api/v1. */
export function createApiRouter(services: Services): Router {
  const c = createControllers(services);
  const r = Router();

  r.get('/dashboard', c.data.dashboard);

  r.get('/settings', c.settings.get);
  r.patch('/settings', c.settings.update);


  r.get('/expenses', c.expenses.list);
  r.post('/expenses', c.expenses.create);
  r.get('/expenses/:id', c.expenses.get);
  r.patch('/expenses/:id', c.expenses.update);
  r.delete('/expenses/:id', c.expenses.delete);

  r.post('/parts', c.expenses.createPart);
  r.patch('/parts/:id', c.expenses.updatePart);
  r.delete('/parts/:id', c.expenses.deletePart);

  r.post('/plans', c.expenses.createPlan);
  r.patch('/plans/:id', c.expenses.updatePlan);
  r.delete('/plans/:id', c.expenses.deletePlan);
  r.post('/plans/:id/charges', c.expenses.addCharge);
  r.delete('/plans/:id/charges/:chargeId', c.expenses.deleteCharge);

  r.post('/payments', c.expenses.logPayment);
  r.patch('/payments/:id', c.expenses.updatePayment);
  r.delete('/payments/:id', c.expenses.deletePayment);

  r.get('/projections', c.projections.list);
  r.post('/projections', c.projections.create);
  r.get('/projections/compare', c.projections.compare); // before /:id
  r.get('/projections/:id', c.projections.get);
  r.get('/projections/:id/run', c.projections.run);
  r.patch('/projections/:id', c.projections.update);
  r.delete('/projections/:id', c.projections.delete);
  r.post('/projections/:id/duplicate', c.projections.duplicate);
  r.post('/affordability', c.projections.affordability);

  r.post('/projection-items', c.projections.createItem);
  r.patch('/projection-items/:id', c.projections.updateItem);
  r.delete('/projection-items/:id', c.projections.deleteItem);

  r.put('/overrides', c.projections.upsertOverride);
  r.delete('/overrides/:itemId/:originalDate', c.projections.deleteOverride);
  r.post('/exclusions/toggle', c.projections.toggleExclusion);
  r.post('/checkpoints', c.projections.createCheckpoint);
  r.delete('/checkpoints/:id', c.projections.deleteCheckpoint);

  r.get('/export/backup.json', c.data.exportJson);
  r.post('/import/backup.json', c.data.importJson);
  r.get('/export/expenses.csv', c.data.expensesCsv);
  r.get('/export/projections/:id/csv', c.data.projectionCsv);

  r.get('/backups', c.backups.list);
  r.post('/backups', c.backups.create);
  r.post('/backups/:fileName/restore', c.backups.restore);
  r.get('/backups/:fileName/download', c.backups.download);

  r.get('/system/info', c.data.systemInfo);
  r.post('/system/reset-demo', c.data.resetDemo);
  r.post('/system/clear', c.data.clearAll);

  return r;
}
