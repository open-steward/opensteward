/**
 * Dual-dialect migrator.
 *
 * Both paths share the semantics of
 * `packages/shared/src/sqlite/migrate.ts` (same `_schema_migrations` tracker,
 * 1-based contiguity rule, fail-closed-when-newer guard, per-migration
 * transaction, best-effort `onApplied`) — they just read the `sqlite` or
 * `postgres` member of each `DualMigration`.
 *
 * Migration bodies run via the raw driver (better-sqlite3 `.exec`, pg
 * `client.query`) rather than Kysely, because a single migration may contain
 * multiple `;`-separated statements which Kysely's prepared statements cannot
 * execute.
 */
import type Database from 'better-sqlite3'
import type { Pool, PoolClient } from 'pg'
import type { AppliedMigrationsReport, ApplyMigrationsOptions, DualMigration } from './types'

const TRACKER_TABLE = '_schema_migrations'

// One global advisory-lock key serializes every Postgres migration run (any
// namespace) so replicas booting together cannot race the shared tracker table's
// creation or its (namespace, version) INSERTs. hashtext() maps it to the int4
// pg_advisory_lock expects. SQLite has a single writer, so it needs no equivalent.
const MIGRATION_LOCK_KEY = 'opensteward:schema_migrations'

// Each blocking attempt to grab the lock is bounded by lock_timeout so a wedged
// holder can't hang every other replica's boot silently; we retry (logging) until
// the overall budget elapses, then fail the boot loudly so k8s restarts us (and,
// eventually, the stuck holder — ending its session frees the session-level lock).
const LOCK_ATTEMPT_TIMEOUT_MS = 30_000
const LOCK_TOTAL_BUDGET_MS = 600_000
const PG_LOCK_NOT_AVAILABLE = '55P03'

// Both Pool and a checked-out PoolClient expose query(); the tracker helpers work
// against either, but the lock + the apply loop must share ONE PoolClient (the
// session that holds the advisory lock).
type PgQueryable = Pool | PoolClient

export function validateMigrations(
  namespace: string,
  migrations: ReadonlyArray<DualMigration>,
): void {
  if (!namespace || !/^[a-z][a-z0-9_]*$/i.test(namespace)) {
    throw new Error(
      `migrate: namespace must be a non-empty identifier (got ${JSON.stringify(namespace)})`,
    )
  }
  for (let i = 0; i < migrations.length; i++) {
    const expected = i + 1
    if (migrations[i].version !== expected) {
      throw new Error(
        `migrate[${namespace}]: migrations must be a contiguous 1-based sequence; ` +
          `expected version ${expected} at index ${i}, got ${migrations[i].version}`,
      )
    }
  }
}

export function applySqliteMigrations(
  db: Database.Database,
  namespace: string,
  migrations: ReadonlyArray<DualMigration>,
  opts?: ApplyMigrationsOptions,
): AppliedMigrationsReport {
  validateMigrations(namespace, migrations)
  ensureTracker(db)
  const current = currentVersion(db, namespace)
  if (current > migrations.length) {
    throw new Error(
      `migrate[${namespace}]: database has version ${current} applied but the binary ` +
        `only knows about ${migrations.length} migrations. Refusing to run against a ` +
        `newer schema than this build supports.`,
    )
  }

  const applied: number[] = []
  for (const m of migrations) {
    if (m.version <= current) continue
    const start = Date.now()
    db.exec('BEGIN')
    try {
      if (m.sqlite.trim()) db.exec(m.sqlite)
      db.prepare(
        `INSERT INTO ${TRACKER_TABLE} (namespace, version, applied_at) VALUES (?, ?, ?)`,
      ).run(namespace, m.version, Date.now())
      db.exec('COMMIT')
      applied.push(m.version)
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
    const durationMs = Date.now() - start
    console.log(`[migrate:${namespace}] applied version ${m.version} (${durationMs}ms)`)
    if (opts?.onApplied) {
      try {
        opts.onApplied(m.version, durationMs)
      } catch (cbErr) {
        console.error(
          `[migrate:${namespace}] onApplied callback failed for version ${m.version}:`,
          cbErr,
        )
      }
    }
  }

  return { fromVersion: current, toVersion: currentVersion(db, namespace), applied }
}

function ensureTracker(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (
      namespace  TEXT NOT NULL,
      version    INTEGER NOT NULL,
      applied_at INTEGER NOT NULL,
      PRIMARY KEY (namespace, version)
    )
  `)
}

function currentVersion(db: Database.Database, namespace: string): number {
  const row = db
    .prepare(`SELECT MAX(version) AS v FROM ${TRACKER_TABLE} WHERE namespace = ?`)
    .get(namespace) as { v: number | null } | undefined
  return row?.v ?? 0
}

export async function applyPostgresMigrations(
  pool: Pool,
  namespace: string,
  migrations: ReadonlyArray<DualMigration>,
  opts?: ApplyMigrationsOptions,
): Promise<AppliedMigrationsReport> {
  validateMigrations(namespace, migrations)

  // Hold a single session-scoped advisory lock for the whole run: ensure-tracker,
  // version read, and every per-migration transaction execute on this one client
  // so concurrent booters serialize instead of racing the tracker INSERT. The lock
  // is session-level, so it survives the per-migration COMMIT/ROLLBACKs and is only
  // dropped by pg_advisory_unlock (or the session ending).
  const client = await pool.connect()
  let lockHeld = false
  try {
    // Bound each acquisition attempt; retry until the budget runs out. lock_timeout
    // is reset to unlimited once we hold the lock so legitimately-long migration DDL
    // (e.g. a big table rewrite) is not killed mid-flight.
    await client.query(`SET lock_timeout = '${LOCK_ATTEMPT_TIMEOUT_MS}ms'`)
    const deadline = Date.now() + LOCK_TOTAL_BUDGET_MS
    for (let attempt = 1; ; attempt++) {
      try {
        await client.query('SELECT pg_advisory_lock(hashtext($1))', [MIGRATION_LOCK_KEY])
        lockHeld = true
        break
      } catch (err) {
        const code = (err as { code?: string }).code
        if (code !== PG_LOCK_NOT_AVAILABLE || Date.now() >= deadline) throw err
        console.warn(
          `[migrate:${namespace}] migration lock held by another replica; ` +
            `retrying (attempt ${attempt})…`,
        )
      }
    }
    await client.query('SET lock_timeout = 0')

    await ensureTrackerPg(client)
    const current = await currentVersionPg(client, namespace)
    if (current > migrations.length) {
      throw new Error(
        `migrate[${namespace}]: database has version ${current} applied but the binary ` +
          `only knows about ${migrations.length} migrations. Refusing to run against a ` +
          `newer schema than this build supports.`,
      )
    }

    const applied: number[] = []
    for (const m of migrations) {
      if (m.version <= current) continue
      const start = Date.now()
      try {
        await client.query('BEGIN')
        if (m.postgres.trim()) await client.query(m.postgres)
        await client.query(
          `INSERT INTO ${TRACKER_TABLE} (namespace, version, applied_at) VALUES ($1, $2, $3)`,
          [namespace, m.version, Date.now()],
        )
        await client.query('COMMIT')
        applied.push(m.version)
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      }
      const durationMs = Date.now() - start
      console.log(`[migrate:${namespace}] applied version ${m.version} (${durationMs}ms)`)
      if (opts?.onApplied) {
        try {
          opts.onApplied(m.version, durationMs)
        } catch (cbErr) {
          console.error(
            `[migrate:${namespace}] onApplied callback failed for version ${m.version}:`,
            cbErr,
          )
        }
      }
    }

    return { fromVersion: current, toVersion: await currentVersionPg(client, namespace), applied }
  } finally {
    // Release the advisory lock before returning the connection to the pool. If the
    // unlock itself fails, destroy the connection rather than hand a lock-holding
    // session back to the pool (which would leak the lock onto a future borrower).
    let destroy = false
    if (lockHeld) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1))', [MIGRATION_LOCK_KEY])
      } catch {
        destroy = true
      }
    }
    client.release(destroy)
  }
}

async function ensureTrackerPg(db: PgQueryable): Promise<void> {
  // applied_at is BIGINT here (epoch ms) where SQLite uses INTEGER; every other
  // column matches so the tracker semantics are dialect-identical.
  await db.query(`
    CREATE TABLE IF NOT EXISTS ${TRACKER_TABLE} (
      namespace  TEXT NOT NULL,
      version    INTEGER NOT NULL,
      applied_at BIGINT NOT NULL,
      PRIMARY KEY (namespace, version)
    )
  `)
}

async function currentVersionPg(db: PgQueryable, namespace: string): Promise<number> {
  const res = await db.query<{ v: number | string | null }>(
    `SELECT MAX(version) AS v FROM ${TRACKER_TABLE} WHERE namespace = $1`,
    [namespace],
  )
  const v = res.rows[0]?.v
  return v == null ? 0 : Number(v)
}
