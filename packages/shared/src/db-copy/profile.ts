/**
 * A service database, described by the code that opens it.
 *
 * A profile does not list tables or migration versions. It opens the same
 * stores, against a handle, that the service opens at boot — `open()` is a
 * few `XStore.create(handle, …)` calls lifted from the service's server.ts.
 * `recordProfile()` runs it once against a scratch in-memory SQLite database
 * through a handle that records every `migrate(namespace, migrations)` call.
 * That gives, straight from the build that is running:
 *
 *   - every migration namespace this database holds, with the exact
 *     `DualMigration` arrays the service applies (so the copy can bring a
 *     target to the same versions through the same migrator), and
 *   - the tables those migrations create (the copy set), and the rows a
 *     freshly migrated database already has (seed rows: the 'default'
 *     tenant, built-in roles, runtime-setting defaults, …), which is what
 *     "empty" means for a target.
 *
 * Nothing about the schema is written down twice, so a new migration is
 * picked up with no change here. A new STORE is not: it has to be added to
 * the profile's `open()`. The copy refuses a SQLite source holding a table or
 * namespace the profile does not know, which is the runtime net for that.
 */
import { openDb } from '../db/open'
import type {
  AppliedMigrationsReport,
  ApplyMigrationsOptions,
  DbHandle,
  DualMigration,
  KyselyDb,
} from '../db/types'

export interface DbCopyProfile {
  /** CLI name, e.g. `admin`, `credentials`, `resources`, `webhook`. */
  name: string
  /** One line for `--list`: the service and the SQLite file it replaces. */
  description: string
  /** The SQLite path inside the service image (help text only). */
  defaultSqlitePath?: string
  /**
   * Open every store the service opens on this database, as its boot does.
   * Only the migrations matter; the stores are discarded. Secrets can be
   * placeholders — no store encrypts or decrypts anything while opening.
   */
  open(handle: DbHandle): Promise<void>
}

export interface RecordedNamespace {
  namespace: string
  migrations: ReadonlyArray<DualMigration>
}

export interface RecordedProfile {
  profile: DbCopyProfile
  /** In the order the service migrates them. */
  namespaces: RecordedNamespace[]
  /** Tables the profile's migrations create, excluding `_schema_migrations`. */
  tables: string[]
  /** Row count per table in a freshly opened database (seed rows). */
  seedCounts: Record<string, number>
}

/** Placeholder for store constructors that take the store secret. */
export const SCHEMA_ONLY_SECRET = 'db-copy-schema-only-placeholder-secret-never-used'

export const TRACKER_TABLE = '_schema_migrations'

/**
 * Run `fn` with console.log silenced. The migrator logs one line per applied
 * version, which on a scratch database is noise that reads like it touched
 * something real.
 */
export async function quietly<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.log
  console.log = () => {}
  try {
    return await fn()
  } finally {
    console.log = original
  }
}

class RecordingHandle implements DbHandle {
  readonly recorded: RecordedNamespace[] = []
  constructor(private readonly inner: DbHandle) {}
  get dialect() {
    return this.inner.dialect
  }
  get kysely(): KyselyDb {
    return this.inner.kysely
  }
  transaction<T>(fn: (tx: KyselyDb) => Promise<T>): Promise<T> {
    return this.inner.transaction(fn)
  }
  migrate(
    namespace: string,
    migrations: ReadonlyArray<DualMigration>,
    opts?: ApplyMigrationsOptions,
  ): Promise<AppliedMigrationsReport> {
    const seen = this.recorded.find((r) => r.namespace === namespace)
    if (seen && seen.migrations.length !== migrations.length) {
      return Promise.reject(
        new Error(
          `profile migrates namespace '${namespace}' twice with different migration sets ` +
            `(${seen.migrations.length} vs ${migrations.length})`,
        ),
      )
    }
    if (!seen) this.recorded.push({ namespace, migrations })
    return this.inner.migrate(namespace, migrations, opts)
  }
  execScript(sql: string): Promise<void> {
    return this.inner.execScript(sql)
  }
  close(): Promise<void> {
    // Stores borrow the handle and never close it; the recorder owns it.
    return Promise.resolve()
  }
}

export async function recordProfile(profile: DbCopyProfile): Promise<RecordedProfile> {
  const scratch = await openDb({ sqlitePath: ':memory:' })
  try {
    const recorder = new RecordingHandle(scratch)
    await quietly(() => profile.open(recorder))
    const { sql } = await import('kysely')
    const tables = (
      await sql<{ name: string }>`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\' AND name <> ${TRACKER_TABLE}
        ORDER BY name`.execute(scratch.kysely)
    ).rows.map((r) => r.name)
    const seedCounts: Record<string, number> = {}
    for (const t of tables) {
      const res = await sql<{ n: number }>`SELECT COUNT(*) AS n FROM ${sql.id(t)}`.execute(
        scratch.kysely,
      )
      seedCounts[t] = Number(res.rows[0]?.n ?? 0)
    }
    if (recorder.recorded.length === 0) {
      throw new Error(`profile '${profile.name}' opened no store that runs migrations`)
    }
    return { profile, namespaces: recorder.recorded, tables, seedCounts }
  } finally {
    await scratch.close()
  }
}
