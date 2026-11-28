/**
 * Schema migrations. Append new entries; never edit an applied one.
 *
 * Conventions:
 *  - Money columns end in `_minor` and hold integer minor units (centavos).
 *  - Dates are ISO `YYYY-MM-DD` text; timestamps are ISO-8601 UTC text.
 *  - Booleans are INTEGER 0/1.
 *  - Recurrence rules are stored as JSON (`recurrence_json`) because they are only ever
 *    expanded by the shared engine, never queried by field.
 *  - List order = insertion order (ORDER BY rowid).
 *  - Version 3 removed accounts: a projection now starts from a list of labelled "start
 *    sources" that simply add up, and everything else runs on one pooled balance.
 *  - Version 4 removed "done" tracking on projection items: a recorded actual amount/date
 *    became that occurrence's planned amount/date, so balances do not change.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const ts = `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'initial schema',
    sql: `
      CREATE TABLE settings (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        type       TEXT NOT NULL CHECK (type IN ('bank','cash','ewallet','credit','other')),
        color      TEXT NOT NULL,
        archived   INTEGER NOT NULL DEFAULT 0,
        created_at ${ts},
        updated_at ${ts}
      );

      CREATE TABLE expenses (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT,
        icon        TEXT NOT NULL,
        color       TEXT NOT NULL,
        archived    INTEGER NOT NULL DEFAULT 0,
        notes       TEXT,
        created_at  ${ts},
        updated_at  ${ts}
      );

      CREATE TABLE parts (
        id                 TEXT PRIMARY KEY,
        expense_id         TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        name               TEXT NOT NULL,
        notes              TEXT,
        kind               TEXT NOT NULL CHECK (kind IN ('one_time','recurring')),
        is_planned         INTEGER NOT NULL DEFAULT 0,
        price_minor        INTEGER NOT NULL,
        payment_mode       TEXT CHECK (payment_mode IN ('full','installment','flexible')),
        recurrence_json    TEXT,
        default_account_id TEXT,
        created_at         ${ts},
        updated_at         ${ts}
      );
      CREATE INDEX idx_parts_expense ON parts(expense_id);

      CREATE TABLE installment_plans (
        id                       TEXT PRIMARY KEY,
        expense_id               TEXT NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
        name                     TEXT NOT NULL,
        principal_minor          INTEGER NOT NULL,
        down_payment_minor       INTEGER NOT NULL DEFAULT 0,
        down_payment_date        TEXT,
        interest_mode            TEXT NOT NULL CHECK (interest_mode IN ('none','fixed_amount','add_on_rate','from_installment_amount')),
        interest_value           REAL NOT NULL DEFAULT 0,
        installment_amount_minor INTEGER,
        fees_minor               INTEGER NOT NULL DEFAULT 0,
        fees_spread              TEXT NOT NULL CHECK (fees_spread IN ('first_due','all_dues')),
        term_count               INTEGER NOT NULL CHECK (term_count >= 1),
        frequency                TEXT NOT NULL CHECK (frequency IN ('monthly','semi_monthly','biweekly','weekly')),
        first_due_date           TEXT NOT NULL,
        weekend_rule             TEXT NOT NULL,
        default_account_id       TEXT,
        notes                    TEXT,
        created_at               ${ts},
        updated_at               ${ts}
      );
      CREATE INDEX idx_plans_expense ON installment_plans(expense_id);

      -- Many parts <-> one plan
      CREATE TABLE plan_parts (
        plan_id         TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
        part_id         TEXT NOT NULL REFERENCES parts(id) ON DELETE CASCADE,
        allocated_minor INTEGER NOT NULL,
        PRIMARY KEY (plan_id, part_id)
      );

      CREATE TABLE plan_charges (
        id           TEXT PRIMARY KEY,
        plan_id      TEXT NOT NULL REFERENCES installment_plans(id) ON DELETE CASCADE,
        date         TEXT NOT NULL,
        amount_minor INTEGER NOT NULL,
        reason       TEXT NOT NULL,
        created_at   ${ts},
        updated_at   ${ts}
      );
      CREATE INDEX idx_charges_plan ON plan_charges(plan_id);

      -- target_id is polymorphic: part id, "<planId>:<seq>" for plan dues, or charge id
      CREATE TABLE payments (
        id              TEXT PRIMARY KEY,
        date            TEXT NOT NULL,
        amount_minor    INTEGER NOT NULL,
        account_id      TEXT NOT NULL,
        note            TEXT,
        target_type     TEXT NOT NULL CHECK (target_type IN ('part','plan_due','plan_charge','recurring_occurrence')),
        target_id       TEXT NOT NULL,
        occurrence_date TEXT,
        created_at      ${ts},
        updated_at      ${ts}
      );
      CREATE INDEX idx_payments_target ON payments(target_type, target_id);

      CREATE TABLE projections (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        start_date              TEXT NOT NULL,
        end_date                TEXT NOT NULL,
        parent_projection_id    TEXT REFERENCES projections(id) ON DELETE SET NULL,
        include_expense_dues    INTEGER NOT NULL DEFAULT 1,
        expense_dues_account_id TEXT NOT NULL,
        start_note              TEXT,
        end_note                TEXT,
        created_at              ${ts},
        updated_at              ${ts}
      );

      CREATE TABLE projection_start_balances (
        projection_id TEXT NOT NULL REFERENCES projections(id) ON DELETE CASCADE,
        account_id    TEXT NOT NULL,
        amount_minor  INTEGER NOT NULL,
        note          TEXT,
        PRIMARY KEY (projection_id, account_id)
      );

      CREATE TABLE projection_items (
        id              TEXT PRIMARY KEY,
        projection_id   TEXT NOT NULL REFERENCES projections(id) ON DELETE CASCADE,
        type            TEXT NOT NULL CHECK (type IN ('add','minus','transfer')),
        account_id      TEXT NOT NULL,
        to_account_id   TEXT,
        name            TEXT NOT NULL,
        amount_minor    INTEGER NOT NULL,
        note            TEXT,
        recurrence_json TEXT NOT NULL,
        created_at      ${ts},
        updated_at      ${ts}
      );
      CREATE INDEX idx_items_projection ON projection_items(projection_id);

      -- Plan vs actual + one-off edits, keyed by the occurrence's original date
      CREATE TABLE occurrence_overrides (
        item_id              TEXT NOT NULL REFERENCES projection_items(id) ON DELETE CASCADE,
        original_date        TEXT NOT NULL,
        skipped              INTEGER NOT NULL DEFAULT 0,
        moved_to_date        TEXT,
        planned_amount_minor INTEGER,
        status               TEXT NOT NULL CHECK (status IN ('planned','done')),
        actual_amount_minor  INTEGER,
        actual_date          TEXT,
        note                 TEXT,
        created_at           ${ts},
        updated_at           ${ts},
        PRIMARY KEY (item_id, original_date)
      );

      CREATE TABLE projection_exclusions (
        projection_id   TEXT NOT NULL REFERENCES projections(id) ON DELETE CASCADE,
        source_type     TEXT NOT NULL CHECK (source_type IN ('plan_due','plan_charge','recurring_part')),
        source_id       TEXT NOT NULL,
        occurrence_date TEXT NOT NULL,
        created_at      ${ts},
        PRIMARY KEY (projection_id, source_type, source_id, occurrence_date)
      );

      CREATE TABLE balance_checkpoints (
        id                   TEXT PRIMARY KEY,
        projection_id        TEXT NOT NULL REFERENCES projections(id) ON DELETE CASCADE,
        account_id           TEXT NOT NULL,
        date                 TEXT NOT NULL,
        actual_balance_minor INTEGER NOT NULL,
        note                 TEXT,
        created_at           ${ts},
        updated_at           ${ts}
      );
      CREATE INDEX idx_checkpoints_projection ON balance_checkpoints(projection_id);
    `,
  },
  {
    version: 2,
    name: 'first-run welcome flag',
    // Databases that already hold data skip the new welcome screen. Brand-new databases have
    // no accounts at this point, so the flag stays unset (defaults to false → welcome shown).
    sql: `
      INSERT OR IGNORE INTO settings (key, value_json)
      SELECT 'setupComplete', 'true' WHERE EXISTS (SELECT 1 FROM accounts);
    `,
  },
  {
    version: 3,
    name: 'remove accounts; projections start from labelled sources',
    // Account columns have no index or constraint on them, so they can be dropped in place.
    // (Rebuilding projection_items instead would cascade-delete its occurrence overrides.)
    // The old type CHECK on projection_items still lists 'transfer'; validation no longer
    // accepts it, and existing transfers are removed because one pool makes them no-ops.
    sql: `
      CREATE TABLE projection_start_sources (
        projection_id TEXT NOT NULL REFERENCES projections(id) ON DELETE CASCADE,
        label         TEXT NOT NULL,
        amount_minor  INTEGER NOT NULL
      );
      CREATE INDEX idx_start_sources_projection ON projection_start_sources(projection_id);

      INSERT INTO projection_start_sources (projection_id, label, amount_minor)
      SELECT b.projection_id, COALESCE(a.name, b.note, 'Starting balance'), b.amount_minor
      FROM projection_start_balances b
      LEFT JOIN accounts a ON a.id = b.account_id
      WHERE b.amount_minor <> 0
      ORDER BY b.rowid;

      DROP TABLE projection_start_balances;

      DELETE FROM projection_items WHERE type = 'transfer';

      ALTER TABLE parts DROP COLUMN default_account_id;
      ALTER TABLE installment_plans DROP COLUMN default_account_id;
      ALTER TABLE payments DROP COLUMN account_id;
      ALTER TABLE projections DROP COLUMN expense_dues_account_id;
      ALTER TABLE projection_items DROP COLUMN account_id;
      ALTER TABLE projection_items DROP COLUMN to_account_id;
      ALTER TABLE balance_checkpoints DROP COLUMN account_id;

      DELETE FROM settings WHERE key = 'defaultAccountId';
      DROP TABLE accounts;
    `,
  },
  {
    version: 4,
    name: 'remove done/actual tracking from projection items',
    sql: `
      UPDATE occurrence_overrides
      SET planned_amount_minor = actual_amount_minor
      WHERE status = 'done' AND actual_amount_minor IS NOT NULL;

      UPDATE occurrence_overrides
      SET moved_to_date = actual_date
      WHERE status = 'done' AND actual_date IS NOT NULL;

      -- Rows that only marked an occurrence as done no longer change anything
      DELETE FROM occurrence_overrides
      WHERE skipped = 0 AND moved_to_date IS NULL AND planned_amount_minor IS NULL
        AND (note IS NULL OR note = '');

      ALTER TABLE occurrence_overrides DROP COLUMN status;
      ALTER TABLE occurrence_overrides DROP COLUMN actual_amount_minor;
      ALTER TABLE occurrence_overrides DROP COLUMN actual_date;
    `,
  },
];
