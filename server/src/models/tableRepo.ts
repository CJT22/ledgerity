import { Db, SqlValue } from '../db/connection';

export type ColumnType = 'text' | 'int' | 'real' | 'bool' | 'json';

export interface ColumnDef {
  /** Property name on the domain object */
  field: string;
  /** Column name in SQLite */
  column: string;
  type: ColumnType;
  /** How a NULL column is represented on the domain object (default: omitted / undefined). */
  nullAs?: 'undefined' | 'null';
}

export const col = (
  field: string,
  column: string,
  type: ColumnType = 'text',
  nullAs: ColumnDef['nullAs'] = 'undefined'
): ColumnDef => ({ field, column, type, nullAs });

function toSql(value: unknown, type: ColumnType): SqlValue {
  // Booleans are NOT NULL columns: an absent optional flag means false
  if (type === 'bool') return value ? 1 : 0;
  if (value === undefined || value === null) return null;
  switch (type) {
    case 'int':
      return Math.round(Number(value));
    case 'real':
      return Number(value);
    case 'json':
      return JSON.stringify(value);
    default:
      return String(value);
  }
}

function fromSql(value: unknown, type: ColumnType): unknown {
  if (value === null || value === undefined) return undefined;
  switch (type) {
    case 'bool':
      return Number(value) !== 0;
    case 'int':
    case 'real':
      return Number(value);
    case 'json':
      return JSON.parse(String(value));
    default:
      return String(value);
  }
}

/**
 * Generic row <-> domain-object mapper with basic CRUD.
 * Rows are returned in insertion order (rowid), matching how lists behave in the UI.
 */
export class TableRepo<T extends object> {
  private readonly nonKeyCols: ColumnDef[];
  private readonly keyCols: ColumnDef[];

  constructor(
    protected readonly db: Db,
    readonly table: string,
    readonly columns: ColumnDef[],
    readonly primaryKey: string[] = ['id'],
    private readonly hasUpdatedAt = true
  ) {
    this.keyCols = primaryKey.map((f) => {
      const c = columns.find((cd) => cd.field === f);
      if (!c) throw new Error(`Primary key field ${f} missing in ${table}`);
      return c;
    });
    this.nonKeyCols = columns.filter((c) => !primaryKey.includes(c.field));
  }

  fromRow(row: Record<string, unknown>): T {
    const obj: Record<string, unknown> = {};
    for (const c of this.columns) {
      const v = fromSql(row[c.column], c.type);
      if (v === undefined) {
        if (c.nullAs === 'null') obj[c.field] = null;
      } else {
        obj[c.field] = v;
      }
    }
    return obj as T;
  }

  private values(obj: T, cols: ColumnDef[]): SqlValue[] {
    const rec = obj as Record<string, unknown>;
    return cols.map((c) => toSql(rec[c.field], c.type));
  }

  private keyWhere(): string {
    return this.keyCols.map((c) => `${c.column} = ?`).join(' AND ');
  }

  list(where = '', ...params: SqlValue[]): T[] {
    const sql = `SELECT * FROM ${this.table}${where ? ` WHERE ${where}` : ''} ORDER BY rowid`;
    return this.db.all<Record<string, unknown>>(sql, ...params).map((r) => this.fromRow(r));
  }

  get(...key: SqlValue[]): T | undefined {
    const row = this.db.get<Record<string, unknown>>(
      `SELECT * FROM ${this.table} WHERE ${this.keyWhere()}`,
      ...key
    );
    return row ? this.fromRow(row) : undefined;
  }

  insert(obj: T): void {
    const cols = this.columns.map((c) => c.column).join(', ');
    const qs = this.columns.map(() => '?').join(', ');
    this.db.run(
      `INSERT INTO ${this.table} (${cols}) VALUES (${qs})`,
      ...this.values(obj, this.columns)
    );
  }

  /** Full-row update of all non-key columns. Returns false if no row matched. */
  update(obj: T): boolean {
    const sets = this.nonKeyCols.map((c) => `${c.column} = ?`);
    if (this.hasUpdatedAt) sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    const r = this.db.run(
      `UPDATE ${this.table} SET ${sets.join(', ')} WHERE ${this.keyWhere()}`,
      ...this.values(obj, this.nonKeyCols),
      ...this.values(obj, this.keyCols)
    );
    return r.changes > 0;
  }

  /** Insert or update by primary key, keeping the original rowid (and thus list order). */
  upsert(obj: T): void {
    const cols = this.columns.map((c) => c.column).join(', ');
    const qs = this.columns.map(() => '?').join(', ');
    const sets = this.nonKeyCols.map((c) => `${c.column} = excluded.${c.column}`);
    if (this.hasUpdatedAt) sets.push(`updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`);
    const conflict = this.keyCols.map((c) => c.column).join(', ');
    this.db.run(
      `INSERT INTO ${this.table} (${cols}) VALUES (${qs})
       ON CONFLICT (${conflict}) DO ${sets.length ? `UPDATE SET ${sets.join(', ')}` : 'NOTHING'}`,
      ...this.values(obj, this.columns)
    );
  }

  delete(...key: SqlValue[]): boolean {
    return this.db.run(`DELETE FROM ${this.table} WHERE ${this.keyWhere()}`, ...key).changes > 0;
  }

  deleteWhere(where: string, ...params: SqlValue[]): number {
    return this.db.run(`DELETE FROM ${this.table} WHERE ${where}`, ...params).changes;
  }

  deleteAll(): void {
    this.db.run(`DELETE FROM ${this.table}`);
  }
}
