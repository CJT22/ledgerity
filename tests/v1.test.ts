/** Tests for the v1.0.0 behaviour changes (balance semantics, first run, hardening). */
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createEmptyState } from '@shared/defaults';
import { semiMonthlyDays, buildSchedule } from '@shared/domain';
import { buildDashboard, buildExpensesCsv, runProjectionById } from '@shared/queries';
import { createSeedState } from '@shared/seed';
import type { InstallmentPlan } from '@shared/types';
import { createApp } from '../server/src/app';
import { loadConfig } from '../server/src/config';
import { Db } from '../server/src/db/connection';
import { migrations } from '../server/src/db/migrations';
import { Models } from '../server/src/models';

const TODAY = '2026-11-24';

describe('dashboard current balance', () => {
  it('counts only confirmed items; unconfirmed past items are reported as pending', () => {
    const state = createSeedState(TODAY);
    const dash = buildDashboard(state, TODAY);
    const proj = runProjectionById(state, 'proj_main', TODAY);
    const lastPast = proj.rows.filter((r) => r.effectiveDate <= TODAY).slice(-1)[0];

    // The seed has an overdue, unpaid car installment inside the current cutoff
    expect(dash.pendingConfirmationCount).toBeGreaterThanOrEqual(1);
    expect(dash.pendingConfirmationNet).toBeLessThan(0);
    // Projection (assumes everything happened) = confirmed balance + pending effect
    expect(dash.totalBalance + dash.pendingConfirmationNet).toBe(lastPast.runningTotal);
  });

  it('demo projection starts from the sum of its sources', () => {
    const state = createSeedState(TODAY);
    const proj = runProjectionById(state, 'proj_main', TODAY);
    expect(proj.projection.startSources).toHaveLength(3);
    expect(proj.summary.startTotal).toBe(4_500_000 + 500_000 + 300_000);
  });
});

describe('semi-monthly installments', () => {
  it('follow the first due date instead of fixed 10th/25th', () => {
    expect(semiMonthlyDays('2026-12-05')).toEqual([5, 20]);
    expect(semiMonthlyDays('2026-12-25')).toEqual([10, 25]);
    expect(semiMonthlyDays('2026-12-31')).toEqual([16, 31]);
    const plan: InstallmentPlan = {
      id: 'p',
      expenseId: 'e',
      name: 'P',
      partAllocations: [],
      principal: 400_000,
      downPayment: 0,
      interestMode: 'none',
      interestValue: 0,
      fees: 0,
      feesSpread: 'first_due',
      termCount: 4,
      frequency: 'semi_monthly',
      firstDueDate: '2026-12-01',
      weekendRule: 'none',
      charges: [],
    };
    expect(buildSchedule(plan, [], TODAY).dues.map((d) => d.dueDate)).toEqual([
      '2026-12-01',
      '2026-12-16',
      '2027-01-01',
      '2027-01-16',
    ]);
  });
});

describe('CSV export', () => {
  it('neutralises spreadsheet formulas but keeps negative numbers', () => {
    const state = createSeedState(TODAY);
    state.parts[0] = { ...state.parts[0], name: '=HYPERLINK("http://x","click")', notes: '@SUM(A1)' };
    const csv = buildExpensesCsv(state);
    expect(csv).toContain(`"'=HYPERLINK(""http://x"",""click"")"`);
    expect(csv).toContain("'@SUM(A1)");
    expect(csv).not.toMatch(/(^|,)=HYPERLINK/m);
  });
});

describe('first run & migrations', () => {
  it('a fresh workspace needs the welcome screen; demo data does not', () => {
    expect(createEmptyState().settings.setupComplete).toBe(false);
    expect(createEmptyState().settings.lanAccess).toBe(false);
    expect(createSeedState(TODAY).settings.setupComplete).toBe(true);
  });

  it('existing databases are marked as set up by migration 2', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledgerity-v1-'));
    const file = path.join(dir, 'v1.sqlite');
    try {
      // A v1 database with data in it: no setupComplete flag stored
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY, name TEXT NOT NULL,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')));`);
      old.exec(migrations[0].sql);
      old.prepare('INSERT INTO schema_migrations (version, name) VALUES (1, ?)').run(migrations[0].name);
      old.exec(`INSERT INTO accounts (id, name, type, color) VALUES ('acc_main', 'Main', 'bank', '#000');`);
      old.close();

      const db = new Db(file); // applies migrations 2 and 3
      expect(new Models(db).settings.get().setupComplete).toBe(true);
      db.close();
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('security headers', () => {
  it('sends hardening headers and a strict CSP when serving the built UI', async () => {
    const db = new Db(':memory:');
    const models = new Models(db);
    models.replaceState(createSeedState(TODAY));
    const config = loadConfig({ dbFile: ':memory:', serveClient: true });
    const { app } = createApp({ db, models, config, today: () => TODAY });
    const server = app.listen(0, '127.0.0.1');
    await new Promise<void>((r) => server.once('listening', () => r()));
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/settings`);
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    await new Promise<void>((r) => server.close(() => r()));
    db.close();
  });
});
