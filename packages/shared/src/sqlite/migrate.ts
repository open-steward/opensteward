/**
 * Forward-only SQLite migration helper.
 *
 * Tracks applied migrations in a single `_schema_migrations` table, keyed
 * by a per-store `namespace`. The namespace exists because OpenSteward
 * stores routinely share one SQLite file (e.g. CredentialStore +
 * ApiKeyStore both open `storePath`), so a single `PRAGMA user_version`
 * — which is per-file, not per-table — would collide. Each store passes
 * its own namespace; helper tracks them independently.
 *
 * Usage:
 *
 *   applyMigrations(this.db, 'credentials', [
 *     { version: 1, sql: 'CREATE TABLE IF NOT EXISTS credentials (...)' },
 *     { version: 2, sql: 'ALTER TABLE credentials ADD COLUMN description TEXT' },
 *   ])
 *
 * Rules enforced:
 * - Versions are 1-based and must be a contiguous ascending sequence
 *   starting at 1 (1, 2, 3, ...). Gaps or duplicates throw at boot.
 * - Refuses to run when the namespace is already at a higher version
 *   than the binary declares — that means the binary is older than the
 *   database. Fail closed rather than risk corruption.
 * - Each migration runs inside its own transaction; a mid-migration
 *   crash rolls back and the tracker row is not advanced.
 * - SQL may contain multiple statements separated by `;` (better-sqlite3
 *   runs them as a script via `exec`).
 */
import type Database from 'better-sqlite3'

export interface Migration {
  version: number
  sql: string
}

export interface AppliedMigrationsReport {
  /** Highest version already applied for this namespace before the call. */
  fromVersion: number
  /** Highest version applied for this namespace after the call returns. */
  toVersion: number
  /** Versions actually applied during this call (in order). */
  applied: number[]
}

export interface ApplyMigrationsOptions {
  /**
   * Invoked after each successful migration's transaction commits. Lets
   * callers (e.g. admin-api stores) record a per-version audit log row
   * without coupling this helper to any particular audit-log shape.
   *
   * Errors thrown here are caught and logged to stderr — they do NOT
   * roll the migration back. The schema change has already been
   * committed by the time this fires; we treat the audit write as
   * best-effort observability, not a transactional invariant.
   */
  onApplied?: (version: number, durationMs: number) => void
}

const TRACKER_TABLE = '_schema_migrations'

export function applyMigrations(
  db: Database.Database,
  namespace: string,
  migrations: ReadonlyArray<Migration>,
  opts?: ApplyMigrationsOptions,
): AppliedMigrationsReport {
  if (!namespace || !/^[a-z][a-z0-9_]*$/i.test(namespace)) {
    throw new Error(
      `applyMigrations: namespace must be a non-empty identifier (got ${JSON.stringify(namespace)})`,
    )
  }
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    const expected = i + 1
    if (m.version !== expected) {
      throw new Error(
        `applyMigrations[${namespace}]: migrations must be a contiguous 1-based ` +
          `sequence; expected version ${expected} at index ${i}, got ${m.version}`,
      )
    }
  }

  ensureTracker(db)
  const current = currentVersion(db, namespace)
  if (current > migrations.length) {
    throw new Error(
      `applyMigrations[${namespace}]: database has version ${current} applied ` +
        `but the binary only knows about ${migrations.length} migrations. ` +
        `Refusing to run against a newer schema than this build supports.`,
    )
  }

  const applied: number[] = []
  for (const m of migrations) {
    if (m.version <= current) continue
    const start = Date.now()
    db.exec('BEGIN')
    try {
      db.exec(m.sql)
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
    // One line per migration so `docker compose logs` shows a single
    // grep-friendly record per applied version. The bracketed prefix
    // matches the migration namespace, mirroring the convention the
    // rest of the codebase uses for component-scoped logs.

    console.log(`[migrate:${namespace}] applied version ${m.version} (${durationMs}ms)`)
    if (opts?.onApplied) {
      try {
        opts.onApplied(m.version, durationMs)
      } catch (cbErr) {
        // Best-effort — never let an audit-log write turn a successful
        // migration into a failing boot. The schema change has already
        // committed; we just lose the observability signal for it.

        console.error(
          `[migrate:${namespace}] onApplied callback failed for version ${m.version}:`,
          cbErr,
        )
      }
    }
  }

  return {
    fromVersion: current,
    toVersion: currentVersion(db, namespace),
    applied,
  }
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
