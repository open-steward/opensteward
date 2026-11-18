/**
 * `Conn` over better-sqlite3. Integers are read with `safeIntegers` (as
 * BigInt) and narrowed only when exact, so a value above 2^53 survives.
 */
import Database from 'better-sqlite3'
import { TRACKER_TABLE } from './profile'
import { maxBigInt, quoteIdent, type ColumnInfo, type Conn } from './conn'
import { narrowBigInt } from './values'

interface XInfoRow {
  name: string
  type: string | null
  pk: number
  hidden: number
}

export class SqliteConn implements Conn {
  readonly dialect = 'sqlite' as const
  private readonly inserts = new Map<string, Database.Statement>()

  private constructor(readonly db: Database.Database) {}

  /** `readonly` for a source: the copy must never be able to write to it. */
  static open(path: string, opts: { readonly: boolean }): SqliteConn {
    const db = new Database(path, { readonly: opts.readonly, fileMustExist: opts.readonly })
    db.pragma('busy_timeout = 5000')
    return new SqliteConn(db)
  }

  listTables(): Promise<string[]> {
    const rows = this.db
      .prepare(
        `SELECT name FROM sqlite_master
         WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
         ORDER BY name`,
      )
      .all() as Array<{ name: string }>
    return Promise.resolve(rows.map((r) => r.name))
  }

  columns(table: string): Promise<ColumnInfo[]> {
    const rows = this.db.prepare(`PRAGMA table_xinfo(${quoteIdent(table)})`).all() as XInfoRow[]
    // hidden 2/3 = generated columns, which cannot be inserted into.
    return Promise.resolve(
      rows
        .filter((r) => r.hidden === 0)
        .map((r) => ({ name: r.name, type: r.type ?? '', pk: r.pk, identityAlways: false })),
    )
  }

  parents(table: string): Promise<string[]> {
    const rows = this.db.prepare(`PRAGMA foreign_key_list(${quoteIdent(table)})`).all() as Array<{
      table: string
    }>
    return Promise.resolve([...new Set(rows.map((r) => r.table))].filter((t) => t !== table))
  }

  private autoincrementColumn(table: string): string | undefined {
    const row = this.db
      .prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(table) as { sql: string | null } | undefined
    if (!row?.sql || !/\bAUTOINCREMENT\b/i.test(row.sql)) return undefined
    const pk = (
      this.db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as XInfoRow[]
    ).filter((r) => r.pk > 0)
    return pk.length === 1 ? pk[0]!.name : undefined
  }

  private hasSequenceTable(): boolean {
    return (
      this.db
        .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'sqlite_sequence'`)
        .get() !== undefined
    )
  }

  sequenceColumns(table: string): Promise<string[]> {
    const col = this.autoincrementColumn(table)
    return Promise.resolve(col ? [col] : [])
  }

  sequencePosition(table: string, column: string): Promise<bigint> {
    if (this.autoincrementColumn(table) !== column || !this.hasSequenceTable()) {
      return Promise.resolve(0n)
    }
    const row = this.db
      .prepare(`SELECT seq FROM sqlite_sequence WHERE name = ?`)
      .safeIntegers(true)
      .get(table) as { seq: bigint | null } | undefined
    return Promise.resolve(row?.seq ?? 0n)
  }

  setSequence(table: string, column: string, atLeast: bigint): Promise<bigint> {
    const maxRow = this.db
      .prepare(`SELECT MAX(${quoteIdent(column)}) AS m FROM ${quoteIdent(table)}`)
      .safeIntegers(true)
      .get() as { m: bigint | null }
    const maxId = maxRow.m ?? 0n
    if (this.autoincrementColumn(table) !== column) {
      // A plain rowid table hands out MAX(rowid)+1; there is nothing to set.
      return Promise.resolve(maxId + 1n)
    }
    // AUTOINCREMENT never reuses an id, even one since deleted: carry the
    // source's high-water mark over, not just the largest id still present.
    const cur = (
      this.db
        .prepare(`SELECT seq FROM sqlite_sequence WHERE name = ?`)
        .safeIntegers(true)
        .get(table) as { seq: bigint } | undefined
    )?.seq
    const n = maxBigInt(maxBigInt(atLeast, maxId), cur ?? 0n)
    if (cur === undefined) {
      // No row yet means "nothing issued"; only a real high-water mark needs one.
      if (n > 0n) {
        this.db.prepare(`INSERT INTO sqlite_sequence (name, seq) VALUES (?, ?)`).run(table, n)
      }
    } else {
      this.db.prepare(`UPDATE sqlite_sequence SET seq = ? WHERE name = ?`).run(n, table)
    }
    return Promise.resolve(n + 1n)
  }

  migrationVersions(): Promise<Map<string, number>> {
    const out = new Map<string, number>()
    const present = this.db
      .prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`)
      .get(TRACKER_TABLE)
    if (!present) return Promise.resolve(out)
    const rows = this.db
      .prepare(`SELECT namespace, MAX(version) AS v FROM ${TRACKER_TABLE} GROUP BY namespace`)
      .all() as Array<{ namespace: string; v: number }>
    for (const r of rows) out.set(r.namespace, Number(r.v))
    return Promise.resolve(out)
  }

  count(table: string): Promise<number> {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM ${quoteIdent(table)}`).get() as {
      n: number
    }
    return Promise.resolve(Number(row.n))
  }

  begin(mode: 'read' | 'write'): Promise<void> {
    if (mode === 'write') {
      this.db.exec('BEGIN IMMEDIATE')
    } else {
      // A deferred transaction takes its snapshot at the first read; read now
      // so every count and every row comes from the same snapshot.
      this.db.exec('BEGIN')
      this.db.prepare('SELECT COUNT(*) FROM sqlite_master').get()
    }
    return Promise.resolve()
  }

  commit(): Promise<void> {
    this.db.exec('COMMIT')
    return Promise.resolve()
  }

  rollback(): Promise<void> {
    if (this.db.inTransaction) this.db.exec('ROLLBACK')
    return Promise.resolve()
  }

  clear(tables: string[]): Promise<void> {
    for (const t of [...tables].reverse()) this.db.exec(`DELETE FROM ${quoteIdent(t)}`)
    return Promise.resolve()
  }

  async *read(
    table: string,
    columns: ColumnInfo[],
    batchSize: number,
  ): AsyncGenerator<unknown[][]> {
    const pk = columns.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)
    const order = pk.length ? ` ORDER BY ${pk.map((c) => quoteIdent(c.name)).join(', ')}` : ''
    const stmt = this.db
      .prepare(
        `SELECT ${columns.map((c) => quoteIdent(c.name)).join(', ')} FROM ${quoteIdent(table)}${order}`,
      )
      .raw(true)
      .safeIntegers(true)
    let batch: unknown[][] = []
    // If the consumer stops early (an insert failed), for-of closes the
    // statement iterator so the connection is free for the ROLLBACK.
    for (const row of stmt.iterate() as IterableIterator<unknown[]>) {
      batch.push(row.map((v) => (typeof v === 'bigint' ? narrowBigInt(v) : v)))
      if (batch.length >= batchSize) {
        yield batch
        batch = []
      }
    }
    if (batch.length) yield batch
  }

  insert(table: string, columns: ColumnInfo[], rows: unknown[][]): Promise<void> {
    let stmt = this.inserts.get(table)
    if (!stmt) {
      stmt = this.db.prepare(
        `INSERT INTO ${quoteIdent(table)} (${columns.map((c) => quoteIdent(c.name)).join(', ')}) ` +
          `VALUES (${columns.map(() => '?').join(', ')})`,
      )
      this.inserts.set(table, stmt)
    }
    for (const row of rows) stmt.run(row)
    return Promise.resolve()
  }

  /** Online snapshot of the whole file (better-sqlite3's backup API). */
  async backupTo(path: string): Promise<void> {
    await this.db.backup(path)
  }

  close(): Promise<void> {
    if (this.db.open) this.db.close()
    return Promise.resolve()
  }
}
