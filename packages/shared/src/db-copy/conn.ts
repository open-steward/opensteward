/**
 * The raw-driver surface the copy runs on.
 *
 * The copy deliberately bypasses `DbHandle`/Kysely for the data itself: it
 * needs lossless reads (SQLite integers as BigInt, Postgres int8 / json /
 * timestamps as text), streaming cursors, `OVERRIDING SYSTEM VALUE`, sequence
 * control and exactly one target transaction. Schema preparation still goes
 * through `DbHandle.migrate()` — the service's own migrator — in copy.ts.
 */
export interface ColumnInfo {
  name: string
  /** Declared type (SQLite) or information_schema data_type (Postgres). */
  type: string
  /** 1-based position in the primary key; 0 when not part of it. */
  pk: number
  /** Postgres `GENERATED ALWAYS AS IDENTITY`: explicit ids need OVERRIDING SYSTEM VALUE. */
  identityAlways: boolean
}

export interface Conn {
  readonly dialect: 'sqlite' | 'postgres'
  listTables(): Promise<string[]>
  columns(table: string): Promise<ColumnInfo[]>
  /** Tables this table references through a foreign key (self excluded). */
  parents(table: string): Promise<string[]>
  /** Columns backed by a sequence: SQLite AUTOINCREMENT, Postgres serial/identity. */
  sequenceColumns(table: string): Promise<string[]>
  /** Highest id the sequence has ever handed out (0 when none). */
  sequencePosition(table: string, column: string): Promise<bigint>
  /**
   * Make the next generated id greater than both `atLeast` and every id now
   * in the table. Returns the next id it will hand out.
   */
  setSequence(table: string, column: string, atLeast: bigint): Promise<bigint>
  /** `_schema_migrations`: namespace → highest applied version. Empty when absent. */
  migrationVersions(): Promise<Map<string, number>>
  count(table: string): Promise<number>
  /** `read` = a consistent snapshot for the source; `write` = the one target transaction. */
  begin(mode: 'read' | 'write'): Promise<void>
  commit(): Promise<void>
  rollback(): Promise<void>
  /** Delete every row of these tables (given parents-first; cleared children-first). */
  clear(tables: string[]): Promise<void>
  /** Rows as arrays in `columns` order, in batches, values read losslessly. */
  read(table: string, columns: ColumnInfo[], batchSize: number): AsyncGenerator<unknown[][]>
  /** Insert rows whose values are already converted for this dialect. */
  insert(table: string, columns: ColumnInfo[], rows: unknown[][]): Promise<void>
  close(): Promise<void>
}

export function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

export function maxBigInt(a: bigint, b: bigint): bigint {
  return a > b ? a : b
}
