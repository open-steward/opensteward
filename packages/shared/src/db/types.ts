/**
 * Runtime-selectable storage backend — shared types.
 *
 * OpenSteward uses SQLite by default (unset `DATABASE_URL`) and Postgres when
 * `DATABASE_URL` is set. Both backends sit behind a single `DbHandle` exposing
 * a Kysely query builder plus a dialect-aware migrator. Encryption stays
 * OUTSIDE this seam: stores still call `encrypt()/decrypt()` and a base64
 * string crosses the Kysely boundary, so ciphertext is byte-identical across
 * backends (encrypted columns are `TEXT`, not binary).
 */
// kysely is ESM-only from 0.28+ (the SQL-injection-patched line); this package
// compiles as CommonJS under `module: node16`, so the runtime value import is a
// dynamic `import()` (see ./sqlite) and the type import carries an explicit
// `resolution-mode: import` so tsc resolves it against the ESM entry.
import type { Kysely } from 'kysely' with { 'resolution-mode': 'import' }
import type { AppliedMigrationsReport, ApplyMigrationsOptions } from '../sqlite/migrate'

// Re-exported so callers of the new seam don't reach back into ./sqlite.
export type { AppliedMigrationsReport, ApplyMigrationsOptions }

export type Dialect = 'sqlite' | 'postgres'

/**
 * Schema surface for the typed Kysely instance. Intentionally permissive:
 * the seam compiles against any table/column shape; per-table declarations
 * can tighten it later.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbSchema = Record<string, any>

/** A Kysely instance bound to the (currently permissive) OpenSteward schema. */
export type KyselyDb = Kysely<DbSchema>

/**
 * A schema migration expressed for both dialects. `sqlite` and `postgres` are
 * identical when the DDL is portable; they diverge for AUTOINCREMENT→IDENTITY,
 * `INSERT OR REPLACE`→`ON CONFLICT`, `unixepoch()`→`extract(epoch …)`, etc.
 * Either member MAY contain multiple `;`-separated statements.
 */
export interface DualMigration {
  version: number
  sqlite: string
  postgres: string
}

export interface DbHandle {
  readonly dialect: Dialect
  readonly kysely: KyselyDb
  /** Run `fn` inside a single transaction. */
  transaction<T>(fn: (tx: KyselyDb) => Promise<T>): Promise<T>
  /**
   * Apply forward-only migrations for a namespace, tracked in the shared
   * `_schema_migrations` table. Same contiguity / fail-closed-when-newer /
   * per-migration-transaction semantics as `applyMigrations()` in
   * `../sqlite/migrate`.
   */
  migrate(
    namespace: string,
    migrations: ReadonlyArray<DualMigration>,
    opts?: ApplyMigrationsOptions,
  ): Promise<AppliedMigrationsReport>
  /**
   * Execute a raw, possibly multi-statement SQL/DDL script in the dialect's
   * native form. Used by the migrator and by ops tooling (backup/rotate).
   */
  execScript(sql: string): Promise<void>
  close(): Promise<void>
}

export interface OpenDbOptions {
  /** When set and non-empty → Postgres. Otherwise SQLite. */
  databaseUrl?: string | null
  /** SQLite file path (or `:memory:`). Required when no `databaseUrl`. */
  sqlitePath?: string
  /** Postgres connection-pool ceiling (ignored for SQLite). */
  poolMax?: number
}

export interface ResolvedDbConfig {
  dialect: Dialect
  databaseUrl?: string
  sqlitePath?: string
  poolMax: number
}
