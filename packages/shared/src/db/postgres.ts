/**
 * Postgres-backed `DbHandle`.
 *
 * Engaged when `DATABASE_URL` is set. Wraps a `pg.Pool` in a Kysely
 * `PostgresDialect`. `pg` is CommonJS so it imports statically; kysely is
 * ESM-only (the SQL-injection-patched line) so it loads via dynamic `import()`
 * inside the async `open()` factory, matching the SQLite handle.
 *
 * `open()` fails closed: if the configured database is unreachable the factory
 * rejects rather than returning a handle, so a misconfigured DATABASE_URL in a
 * multi-replica deploy crashes the pod instead of silently degrading.
 */
import { Pool, types } from 'pg'
import type {
  AppliedMigrationsReport,
  ApplyMigrationsOptions,
  DbHandle,
  DbSchema,
  DualMigration,
  KyselyDb,
} from './types'
import { applyPostgresMigrations } from './migrate'

export class PostgresDbHandle implements DbHandle {
  readonly dialect = 'postgres' as const
  readonly kysely: KyselyDb
  private readonly pool: Pool

  private constructor(pool: Pool, kysely: KyselyDb) {
    this.pool = pool
    this.kysely = kysely
  }

  static async open(databaseUrl: string, poolMax: number): Promise<PostgresDbHandle> {
    const { Kysely, PostgresDialect } = await import('kysely')
    // Parse BIGINT/int8 as a JS number so epoch-millisecond and IDENTITY
    // columns round-trip as numbers (matching SQLite's INTEGER), instead of
    // node-postgres's default of returning them as strings. Safe: every int8
    // value in this schema (Date.now() timestamps, row ids) is well under
    // Number.MAX_SAFE_INTEGER. Global + idempotent.
    types.setTypeParser(types.builtins.INT8, (v) => parseInt(v, 10))
    const pool = new Pool({
      connectionString: databaseUrl,
      max: poolMax,
      connectionTimeoutMillis: 5000,
    })

    // Fail closed: verify the database is reachable before handing back a
    // handle. A silent SQLite fallback in an HA deploy would split data.
    try {
      const client = await pool.connect()
      try {
        await client.query('SELECT 1')
      } finally {
        client.release()
      }
    } catch (err) {
      await pool.end().catch(() => {})
      throw new Error(
        `openDb: cannot connect to Postgres at the configured DATABASE_URL: ${
          err instanceof Error ? err.message : String(err)
        }`,
        { cause: err },
      )
    }

    const kysely = new Kysely<DbSchema>({ dialect: new PostgresDialect({ pool }) })
    return new PostgresDbHandle(pool, kysely)
  }

  transaction<T>(fn: (tx: KyselyDb) => Promise<T>): Promise<T> {
    return this.kysely.transaction().execute(fn)
  }

  migrate(
    namespace: string,
    migrations: ReadonlyArray<DualMigration>,
    opts?: ApplyMigrationsOptions,
  ): Promise<AppliedMigrationsReport> {
    return applyPostgresMigrations(this.pool, namespace, migrations, opts)
  }

  execScript(sql: string): Promise<void> {
    return this.pool.query(sql).then(() => undefined)
  }

  close(): Promise<void> {
    // Destroying the Kysely instance ends the underlying pg pool.
    return this.kysely.destroy()
  }
}
