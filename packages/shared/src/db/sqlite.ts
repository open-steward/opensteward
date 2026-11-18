/**
 * SQLite-backed `DbHandle`.
 *
 * Wraps the `better-sqlite3` driver in a Kysely `SqliteDialect` and keeps a
 * reference to the raw driver for multi-statement migration scripts.
 * Pragmas: WAL journal mode and a 5s busy timeout — the settings every store
 * in this codebase relies on.
 *
 * kysely (>=0.28, the SQL-injection-patched line) is ESM-only while this
 * package compiles as CommonJS, so it is loaded via a dynamic `import()` inside
 * the async `open()` factory rather than a top-level static import.
 */
import Database from 'better-sqlite3'
import { mkdirSync } from 'fs'
import { dirname } from 'path'
import type {
  AppliedMigrationsReport,
  ApplyMigrationsOptions,
  DbHandle,
  DbSchema,
  DualMigration,
  KyselyDb,
} from './types'
import { applySqliteMigrations } from './migrate'

export class SqliteDbHandle implements DbHandle {
  readonly dialect = 'sqlite' as const
  readonly kysely: KyselyDb
  private readonly raw: Database.Database

  private constructor(raw: Database.Database, kysely: KyselyDb) {
    this.raw = raw
    this.kysely = kysely
  }

  static async open(sqlitePath: string): Promise<SqliteDbHandle> {
    const { Kysely, SqliteDialect } = await import('kysely')
    // better-sqlite3 creates the file but not its parent directory, so the
    // handle owns the mkdir.
    if (sqlitePath !== ':memory:') {
      mkdirSync(dirname(sqlitePath), { recursive: true })
    }
    const raw = new Database(sqlitePath)
    raw.pragma('journal_mode = WAL')
    raw.pragma('busy_timeout = 5000')
    const kysely = new Kysely<DbSchema>({ dialect: new SqliteDialect({ database: raw }) })
    return new SqliteDbHandle(raw, kysely)
  }

  transaction<T>(fn: (tx: KyselyDb) => Promise<T>): Promise<T> {
    return this.kysely.transaction().execute(fn)
  }

  migrate(
    namespace: string,
    migrations: ReadonlyArray<DualMigration>,
    opts?: ApplyMigrationsOptions,
  ): Promise<AppliedMigrationsReport> {
    try {
      return Promise.resolve(applySqliteMigrations(this.raw, namespace, migrations, opts))
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  execScript(sql: string): Promise<void> {
    try {
      this.raw.exec(sql)
      return Promise.resolve()
    } catch (err) {
      return Promise.reject(err instanceof Error ? err : new Error(String(err)))
    }
  }

  close(): Promise<void> {
    // Destroying the Kysely instance closes the underlying better-sqlite3 db.
    return this.kysely.destroy()
  }
}
