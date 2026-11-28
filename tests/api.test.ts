import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createSeedState } from '@shared/seed';
import { DatabaseSync } from 'node:sqlite';
import type { AppState } from '@shared/types';
import { createApp } from '../server/src/app';
import { loadConfig } from '../server/src/config';
import { Db } from '../server/src/db/connection';
import { migrations } from '../server/src/db/migrations';
import { Models } from '../server/src/models';

const TODAY = '2026-11-24';

async function startServer(dbFile: string, dataDir?: string) {
  const config = loadConfig({
    dbFile,
    ...(dataDir ? { dataDir, backupsDir: path.join(dataDir, 'backups') } : {}),
    serveClient: false,
  });
  const db = new Db(dbFile);
  const models = new Models(db);
  models.replaceState(createSeedState(TODAY));
  const { app } = createApp({ db, models, config, today: () => TODAY });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1`;

  async function call<T = any>(method: string, p: string, body?: unknown, headers: Record<string, string> = {}) {
    const res = await fetch(base() + p, {
      method,
      headers: {
        ...(method !== 'GET' ? { 'X-Ledgerity-Client': '1' } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data: any = text;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      // text response
    }
    return { status: res.status, data: data as T };
  }

  return { db, models, server, call, close: () => new Promise<void>((r) => server.close(() => (db.close(), r()))) };
}

/** Removes undefined keys so states can be compared after a JSON/DB round trip. */
const normalize = (s: AppState) => JSON.parse(JSON.stringify(s));

describe('SQLite persistence', () => {
  it('stores and reloads the full demo state without losing anything', () => {
    const db = new Db(':memory:');
    const models = new Models(db);
    const seed = createSeedState(TODAY);
    models.replaceState(seed);
    const loaded = normalize(models.loadState());
    const expected = normalize(seed);
    // Optional booleans come back as explicit `false`
    for (const ov of expected.overrides) ov.skipped ??= false;
    expect(loaded).toEqual(expected);
    db.close();
  });
});

describe('REST API', () => {
  let t: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    t = await startServer(':memory:');
  });
  afterAll(() => t.close());

  it('serves the dashboard and expense list', async () => {
    const dash = await t.call('GET', '/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.data.today).toBe(TODAY);
    expect(dash.data.activeProjection.projection.id).toBe('proj_main');
    const list = await t.call('GET', '/expenses');
    expect(list.data.map((e: any) => e.expense.id)).toContain('exp_pc');
  });

  it('rejects writes without the client header and requests for foreign hosts', async () => {
    const noHeader = await fetch(`http://127.0.0.1:${(t.server.address() as AddressInfo).port}/api/v1/system/clear`, {
      method: 'POST',
    });
    expect(noHeader.status).toBe(403);
    // fetch() refuses to override Host, so use node:http (simulates DNS rebinding)
    const status = await new Promise<number>((resolve, reject) => {
      http
        .get(
          {
            host: '127.0.0.1',
            port: (t.server.address() as AddressInfo).port,
            path: '/api/v1/settings',
            headers: { Host: 'evil.example.com' },
          },
          (res) => {
            res.resume();
            resolve(res.statusCode ?? 0);
          }
        )
        .on('error', reject);
    });
    expect(status).toBe(403);
  });

  it('validates input with readable errors', async () => {
    const r = await t.call('POST', '/expenses', { name: '', icon: '🎮', color: '#000' });
    expect(r.status).toBe(400);
    expect(r.data.error).toMatch(/name/);
    const pay = await t.call('POST', '/payments', {
      date: TODAY,
      amount: 100,
      targetType: 'part',
      targetId: 'does-not-exist',
    });
    expect(pay.status).toBe(400);
  });

  it('PATCH only changes the fields sent (no silent defaults) and null clears a field', async () => {
    const created = await t.call('POST', '/expenses', {
      name: 'Bike',
      icon: '🚲',
      color: '#111',
      notes: 'some notes',
    });
    expect(created.status).toBe(201);
    const id = created.data.id;
    await t.call('PATCH', `/expenses/${id}`, { archived: true });
    const renamed = await t.call('PATCH', `/expenses/${id}`, { name: 'Road bike', notes: null });
    expect(renamed.data.archived).toBe(true);
    expect(renamed.data.name).toBe('Road bike');
    expect(renamed.data.notes).toBeUndefined();

    const s1 = await t.call('PATCH', '/settings', { lanAccess: false });
    const s2 = await t.call('PATCH', '/settings', { theme: 'dark' });
    expect(s1.data.lanAccess).toBe(false);
    expect(s2.data.lanAccess).toBe(false);
  });

  it('groups parts into one installment plan, logs payments, and cascades deletes', async () => {
    const exp = (await t.call('POST', '/expenses', { name: 'PC 2', icon: '🖥️', color: '#000' })).data;
    const mk = (name: string, price: number) =>
      t.call('POST', '/parts', {
        expenseId: exp.id,
        name,
        kind: 'one_time',
        isPlanned: true,
        price,
        paymentMode: null,
      });
    const gpu = (await mk('GPU', 3_000_000)).data;
    const cpu = (await mk('CPU', 1_000_000)).data;

    const plan = await t.call('POST', '/plans', {
      expenseId: exp.id,
      name: 'Card 6 mo',
      partAllocations: [
        { partId: gpu.id, amount: 3_000_000 },
        { partId: cpu.id, amount: 1_000_000 },
      ],
      principal: 4_000_000,
      downPayment: 0,
      interestMode: 'fixed_amount',
      interestValue: 120_000,
      fees: 0,
      feesSpread: 'first_due',
      termCount: 6,
      frequency: 'monthly',
      firstDueDate: '2026-12-10',
      weekendRule: 'next_business_day',
    });
    expect(plan.status).toBe(201);
    expect(plan.data.partAllocations).toHaveLength(2);

    const detail = (await t.call('GET', `/expenses/${exp.id}`)).data;
    // Covered parts become committed installment parts; interest is in the total
    expect(detail.parts.every((p: any) => p.paymentMode === 'installment' && !p.isPlanned)).toBe(true);
    expect(detail.summary.trueTotal).toBe(4_120_000);
    expect(detail.summary.costOfFinancing).toBe(120_000);

    const pay = await t.call('POST', '/payments', {
      date: '2026-12-10',
      amount: 686_667,
      targetType: 'plan_due',
      targetId: `${plan.data.id}:1`,
    });
    expect(pay.status).toBe(201);
    expect((await t.call('GET', `/expenses/${exp.id}`)).data.summary.paidSoFar).toBe(686_667);

    // Mismatched part from another expense is rejected
    const bad = await t.call('PATCH', `/plans/${plan.data.id}`, {
      partAllocations: [{ partId: 'part_gpu', amount: 1 }],
    });
    expect(bad.status).toBe(400);

    expect((await t.call('DELETE', `/plans/${plan.data.id}`)).status).toBe(204);
    const after = (await t.call('GET', `/expenses/${exp.id}`)).data;
    expect(after.payments).toHaveLength(0);
    expect(after.plans).toHaveLength(0);

    expect((await t.call('DELETE', `/expenses/${exp.id}`)).status).toBe(204);
    expect((await t.call('GET', `/expenses/${exp.id}`)).status).toBe(404);
  });

  it('duplicates a projection as a scenario with its items and overrides', async () => {
    const src = (await t.call('GET', '/projections/proj_main/run')).data;
    const dup = await t.call('POST', '/projections/proj_main/duplicate', { name: 'What if' });
    expect(dup.status).toBe(201);
    expect(dup.data.parentProjectionId).toBe('proj_main');
    const run = (await t.call('GET', `/projections/${dup.data.id}/run`)).data;
    expect(run.items).toHaveLength(src.items.length);
    expect(run.overrides).toHaveLength(src.overrides.length);
    expect(run.summary.endBalance).toBe(src.summary.endBalance);

    const cmp = (await t.call('GET', `/projections/compare?ids=proj_main,${dup.data.id}`)).data;
    expect(cmp.metrics[1].endBalanceDiff).toBe(0);
  });

  it('edits a single occurrence (legacy "done" input is folded in) and toggles exclusions', async () => {
    const run = (await t.call('GET', '/projections/proj_main/run')).data;
    const itemRow = run.rows.find((r: any) => r.source === 'item' && !r.edited);
    const ov = await t.call('PUT', '/overrides', {
      itemId: itemRow.itemId,
      originalDate: itemRow.originalDate,
      plannedAmount: itemRow.plannedAmount + 12_345,
    });
    expect(ov.status).toBe(200);
    const run2 = (await t.call('GET', '/projections/proj_main/run')).data;
    const row2 = run2.rows.find((r: any) => r.rowKey === itemRow.rowKey);
    expect(row2.edited).toBe(true);
    expect(row2.effectiveAmount).toBe(itemRow.plannedAmount + 12_345);

    // Clients/exports from before 2.0.0 may still send done + actual amount
    const legacy = await t.call('PUT', '/overrides', {
      itemId: itemRow.itemId,
      originalDate: itemRow.originalDate,
      status: 'done',
      actualAmount: 777,
    });
    expect(legacy.status).toBe(200);
    expect(legacy.data.plannedAmount).toBe(777);
    expect(legacy.data.status).toBeUndefined();

    const linked = run2.rows.find((r: any) => r.isLinkedFromExpense && !r.excluded);
    const ex = {
      projectionId: 'proj_main',
      sourceType: linked.linkedSourceType,
      sourceId: linked.linkedSourceId,
      occurrenceDate: linked.originalDate,
    };
    expect((await t.call('POST', '/exclusions/toggle', ex)).data.excluded).toBe(true);
    expect((await t.call('POST', '/exclusions/toggle', ex)).data.excluded).toBe(false);
  });

  it('creates a projection from labelled start sources and edits them', async () => {
    const created = await t.call('POST', '/projections', {
      name: 'Sources',
      startDate: '2026-12-01',
      endDate: '2027-01-31',
      includeExpenseDues: false,
      startSources: [
        { label: 'Bank', amount: 2_000_000 },
        { label: 'Cash', amount: 150_000 },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.data.startSources).toEqual([
      { label: 'Bank', amount: 2_000_000 },
      { label: 'Cash', amount: 150_000 },
    ]);
    const run = (await t.call('GET', `/projections/${created.data.id}/run`)).data;
    expect(run.summary.startTotal).toBe(2_150_000);

    const patched = await t.call('PATCH', `/projections/${created.data.id}`, {
      startSources: [{ label: 'Lump sum', amount: 500_000 }],
    });
    expect(patched.status).toBe(200);
    expect(patched.data.startSources).toEqual([{ label: 'Lump sum', amount: 500_000 }]);

    const renamed = await t.call('PATCH', `/projections/${created.data.id}`, {
      name: 'Renamed',
      startDate: '2026-12-01',
      endDate: '2027-01-31',
    });
    expect(renamed.status).toBe(200);
    expect(renamed.data).toMatchObject({ name: 'Renamed', startDate: '2026-12-01', endDate: '2027-01-31' });
    const backwards = await t.call('PATCH', `/projections/${created.data.id}`, {
      startDate: '2027-02-01',
      endDate: '2027-01-01',
    });
    expect(backwards.status).toBe(400);

    const blank = await t.call('PATCH', `/projections/${created.data.id}`, {
      startSources: [{ label: '  ', amount: 1 }],
    });
    expect(blank.status).toBe(400);

    const transfer = await t.call('POST', '/projection-items', {
      projectionId: created.data.id,
      type: 'transfer',
      name: 'Move money',
      amount: 1,
      recurrence: { freq: 'once', interval: 1, startDate: '2026-12-05', weekendRule: 'none' },
    });
    expect(transfer.status).toBe(400);
    expect((await t.call('GET', '/accounts')).status).toBe(404);

    const base = { projectionId: created.data.id, type: 'minus', name: 'Snacks', amount: 100 };
    const custom = await t.call('POST', '/projection-items', {
      ...base,
      recurrence: {
        freq: 'custom',
        interval: 1,
        startDate: '2026-12-01',
        dates: ['2026-12-19', '2026-12-05', '2026-12-05'],
        weekendRule: 'none',
      },
    });
    expect(custom.status).toBe(201);
    expect(custom.data.recurrence.dates).toEqual(['2026-12-05', '2026-12-19']);
    expect(custom.data.recurrence.startDate).toBe('2026-12-05');

    const emptyCustom = await t.call('POST', '/projection-items', {
      ...base,
      recurrence: { freq: 'custom', interval: 1, startDate: '2026-12-01', dates: [], weekendRule: 'none' },
    });
    expect(emptyCustom.status).toBe(400);

    const legacy = await t.call('POST', '/projection-items', {
      ...base,
      recurrence: { freq: 'biweekly', interval: 1, startDate: '2026-12-04', weekendRule: 'none' },
    });
    expect(legacy.data.recurrence.freq).toBe('weekly');
    expect(legacy.data.recurrence.interval).toBe(2);
  });

  it('exports CSV and imports a JSON backup (including AI Studio demo exports)', async () => {
    const csv = await t.call('GET', '/export/expenses.csv');
    expect(csv.status).toBe(200);
    expect(String(csv.data)).toContain('RecordType,Expense');

    const demo = createSeedState(TODAY) as any;
    delete demo.settings.lanAccess; // AI Studio exports predate this setting
    const imported = await t.call('POST', '/import/backup.json', demo);
    expect(imported.status).toBe(200);
    expect(imported.data.settings.lanAccess).toBe(false); // safe default
    expect(imported.data.settings.setupComplete).toBe(true);
    expect(imported.data.expenses).toHaveLength(demo.expenses.length);

    const garbage = await t.call('POST', '/import/backup.json', { hello: 'world' });
    expect(garbage.status).toBe(400);
  });

  it('erases all data, keeping display settings', async () => {
    await t.call('PATCH', '/settings', { currencyCode: 'USD', locale: 'en-US' });
    const r = await t.call('POST', '/system/clear');
    expect(r.data.expenses).toHaveLength(0);
    expect(r.data.projections).toHaveLength(0);
    expect(r.data.settings.currencyCode).toBe('USD');
    const dash = await t.call('GET', '/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.data.activeProjection).toBeNull();
  });
});

describe('migration 3 (accounts removed)', () => {
  it('turns per-account start balances into labelled sources and drops account data', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerity-mig-'));
    const file = path.join(dir, 'old.sqlite');
    try {
      // Build a version-2 database the way older releases left it
      const old = new DatabaseSync(file);
      old.exec('PRAGMA foreign_keys = ON;');
      old.exec(`CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));`);
      for (const m of migrations.filter((x) => x.version <= 2)) {
        old.exec(m.sql);
        old.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      }
      old.exec(`
        INSERT INTO settings (key, value_json) VALUES ('defaultAccountId', '"acc_bank"');
        INSERT INTO accounts (id, name, type, color) VALUES
          ('acc_bank', 'Payroll Bank', 'bank', '#000'), ('acc_cash', 'Cash', 'cash', '#000');
        INSERT INTO projections (id, name, start_date, end_date, expense_dues_account_id)
          VALUES ('p', 'Old', '2026-12-01', '2027-01-31', 'acc_bank');
        INSERT INTO projection_start_balances (projection_id, account_id, amount_minor) VALUES
          ('p', 'acc_bank', 4000000), ('p', 'acc_cash', 250000);
        INSERT INTO projection_items (id, projection_id, type, account_id, to_account_id, name, amount_minor, recurrence_json) VALUES
          ('i_rent', 'p', 'minus', 'acc_bank', NULL, 'Rent', 100000, '{"freq":"once","interval":1,"startDate":"2026-12-05","weekendRule":"none"}'),
          ('i_move', 'p', 'transfer', 'acc_bank', 'acc_cash', 'ATM', 50000, '{"freq":"once","interval":1,"startDate":"2026-12-06","weekendRule":"none"}');
        INSERT INTO occurrence_overrides (item_id, original_date, status, note) VALUES ('i_rent', '2026-12-05', 'done', 'Paid early');
      `);
      old.close();

      const db = new Db(file);
      const state = new Models(db).loadState();
      db.close();

      expect(state.projections[0].startSources).toEqual([
        { label: 'Payroll Bank', amount: 4_000_000 },
        { label: 'Cash', amount: 250_000 },
      ]);
      expect(state.projectionItems.map((i) => i.id)).toEqual(['i_rent']);
      expect(state.overrides).toHaveLength(1); // kept: columns were dropped in place
      expect('defaultAccountId' in state.settings).toBe(false);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('migration 4 (done tracking removed)', () => {
  it('turns recorded actual amounts/dates into per-date edits and drops done-only rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerity-mig4-'));
    const file = path.join(dir, 'old.sqlite');
    try {
      const old = new DatabaseSync(file);
      old.exec('PRAGMA foreign_keys = ON;');
      old.exec(`CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));`);
      for (const m of migrations.filter((x) => x.version <= 3)) {
        old.exec(m.sql);
        old.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name);
      }
      old.exec(`
        INSERT INTO projections (id, name, start_date, end_date) VALUES ('p', 'Old', '2026-12-01', '2027-01-31');
        INSERT INTO projection_items (id, projection_id, type, name, amount_minor, recurrence_json) VALUES
          ('i', 'p', 'minus', 'Groceries', 100000, '{"freq":"weekly","interval":1,"startDate":"2026-12-01","weekendRule":"none"}');
        INSERT INTO occurrence_overrides (item_id, original_date, status, actual_amount_minor, actual_date, skipped) VALUES
          ('i', '2026-12-01', 'done', 123400, '2026-12-02', 0),
          ('i', '2026-12-08', 'done', NULL, NULL, 0),
          ('i', '2026-12-15', 'planned', NULL, NULL, 1);
      `);
      old.close();

      const db = new Db(file);
      const state = new Models(db).loadState();
      db.close();

      expect(state.overrides).toEqual([
        { itemId: 'i', originalDate: '2026-12-01', skipped: false, movedToDate: '2026-12-02', plannedAmount: 123_400 },
        { itemId: 'i', originalDate: '2026-12-15', skipped: true },
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('file backups', () => {
  let dir: string;
  let t: Awaited<ReturnType<typeof startServer>>;
  beforeAll(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerity-test-'));
    t = await startServer(path.join(dir, 'ledgerity.sqlite'), dir);
  });
  afterAll(async () => {
    await t.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('creates a backup and restores it after data changes', async () => {
    const before = (await t.call('GET', '/expenses')).data.length;
    const backup = await t.call('POST', '/backups');
    expect(backup.status).toBe(201);
    expect(backup.data.kind).toBe('manual');

    await t.call('POST', '/system/clear');
    expect((await t.call('GET', '/expenses')).data).toHaveLength(0);

    const restored = await t.call('POST', `/backups/${backup.data.fileName}/restore`);
    expect(restored.status).toBe(204);
    expect((await t.call('GET', '/expenses')).data).toHaveLength(before);

    const list = (await t.call('GET', '/backups')).data as any[];
    expect(list.some((b) => b.kind === 'pre-restore')).toBe(true);
  });

  it('refuses path traversal and non-backup files', async () => {
    const r = await t.call('POST', `/backups/${encodeURIComponent('../ledgerity.sqlite')}/restore`);
    expect(r.status).toBe(400);
  });
});
