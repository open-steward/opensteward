#!/usr/bin/env node
/**
 * `rotate-store-secret` — offline re-encryption of every encrypted-at-rest
 * column when the deployment's `STORE_SECRET` changes.
 *
 * Usage:
 *
 *   pnpm rotate-store-secret --old "$OLD" --new "$NEW" \
 *       --db apps/integration-server/data/credentials.db \
 *       --db apps/integration-server/data/resources.db \
 *       --db apps/admin-api/data/admin.db
 *
 * `resources.db` (the data store) holds destination credentials
 * (`destinations.encrypted_secrets`); include it once destinations are used.
 *
 * The tool is OFFLINE — services must be stopped first. It refuses to run
 * if it detects a fresh `-wal` / `-shm` sibling next to any db file
 * (better-sqlite3 leaves those when a writer is attached). Operators run:
 *
 *   docker compose stop integration-server admin-api webhook-gateway
 *   pnpm rotate-store-secret --old "$OLD" --new "$NEW" --db ...
 *   # update STORE_SECRET in .env / compose env
 *   docker compose start integration-server admin-api webhook-gateway
 *
 * For each db file:
 *   1. Snapshot to `<file>.pre-rotation.bak` (overwriting any prior).
 *   2. Open the db. For every registered `(table, column, salt)` triple:
 *      - SELECT rowid + ciphertext where the column is non-null.
 *      - Try decrypt with OLD: success → re-encrypt with NEW + UPDATE.
 *      - Decrypt fails: try with NEW (idempotent re-run path). If that
 *        succeeds, leave the row alone. If both fail, abort the whole
 *        rotation — the file's encrypted with a third unknown key and
 *        manual intervention is required.
 *   3. Wrap all rewrites for the file in a single transaction so a crash
 *      mid-rotation leaves the file untouched (rollback) and the
 *      `.pre-rotation.bak` exists for paranoia.
 *
 * Re-runs are safe. A second invocation with the same `--old` and `--new`
 * is a no-op (every row decrypts with `--new` already, so the OLD-key
 * branch is skipped).
 *
 * The hash-only stores (`developer_api_keys`, `end_user_tokens`) are NOT
 * touched. Their hashes mix STORE_SECRET into the KDF salt, so rotation
 * invalidates every existing token in those tables. Issue replacements
 * via the admin UI after rotation.
 */
import Database from 'better-sqlite3'
import type { PoolClient } from 'pg'
import { copyFileSync, existsSync, statSync } from 'fs'
import { resolve } from 'path'
import {
  ADMIN_API_BLOBS,
  DATA_STORE_BLOBS,
  HASH_ONLY_STORES,
  INTEGRATION_SERVER_BLOBS,
  type EncryptedBlob,
} from '../sqlite/encrypted-blobs'
import { encrypt, decrypt } from '../auth/crypto'

interface CliArgs {
  oldSecret: string
  newSecret: string
  dbPaths: string[]
  /**
   * Postgres connection string. When set, rotate the single Postgres database
   * instead of SQLite files — every encrypted table lives in one db, so one
   * `--database-url` replaces the per-file `--db` list. Mutually exclusive
   * with `--db`.
   */
  databaseUrl?: string
  /** Skip the WAL-freshness guard. For tests only — never pass in prod. */
  unsafeAllowLiveDb?: boolean
}

interface RotationStats {
  rowsRotated: number
  rowsSkipped: number
  perBlob: Array<{ table: string; column: string; rotated: number; skipped: number }>
}

/** Combined registry: every (table, column, salt) we know how to rotate. */
const ALL_BLOBS: EncryptedBlob[] = [
  ...INTEGRATION_SERVER_BLOBS,
  ...DATA_STORE_BLOBS,
  ...ADMIN_API_BLOBS,
]

/** How recent a -wal/-shm file can be before we refuse (ms). */
const WAL_FRESH_THRESHOLD_MS = 60_000

export function rotateStoreSecret(args: CliArgs): Record<string, RotationStats> {
  if (!args.oldSecret) throw new Error('--old <secret> is required')
  if (!args.newSecret) throw new Error('--new <secret> is required')
  if (args.oldSecret === args.newSecret) {
    throw new Error('--old and --new must differ — refusing to rotate to the same key')
  }
  if (args.dbPaths.length === 0) throw new Error('at least one --db <path> is required')

  if (!args.unsafeAllowLiveDb) {
    for (const dbPath of args.dbPaths) assertNoLiveWriter(dbPath)
  }

  const result: Record<string, RotationStats> = {}
  for (const dbPath of args.dbPaths) {
    const absPath = resolve(dbPath)
    if (!existsSync(absPath)) {
      throw new Error(`db not found: ${absPath}`)
    }
    // Snapshot before opening so even an `open()` failure leaves a backup.
    copyFileSync(absPath, `${absPath}.pre-rotation.bak`)
    const db = new Database(absPath)
    try {
      db.pragma('journal_mode = WAL')
      db.pragma('busy_timeout = 5000')
      result[absPath] = rotateOneDb(db, args.oldSecret, args.newSecret)
    } finally {
      db.close()
    }
  }
  return result
}

function rotateOneDb(db: Database.Database, oldSecret: string, newSecret: string): RotationStats {
  const stats: RotationStats = { rowsRotated: 0, rowsSkipped: 0, perBlob: [] }

  // Wrap everything for this file in a single transaction so a partial
  // failure rolls back rather than leaving the file half-rotated.
  db.exec('BEGIN')
  try {
    for (const blob of ALL_BLOBS) {
      if (!tableExists(db, blob.table)) continue
      const blobStats = rotateBlob(db, blob, oldSecret, newSecret)
      stats.perBlob.push({
        table: blob.table,
        column: blob.column,
        rotated: blobStats.rotated,
        skipped: blobStats.skipped,
      })
      stats.rowsRotated += blobStats.rotated
      stats.rowsSkipped += blobStats.skipped
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  return stats
}

function rotateBlob(
  db: Database.Database,
  blob: EncryptedBlob,
  oldSecret: string,
  newSecret: string,
): { rotated: number; skipped: number } {
  // Materialize rows up-front: better-sqlite3 forbids UPDATE while a SELECT
  // iterator is open on the same connection. Row counts are small (encrypted
  // stores are admin-scale, not high-volume), so .all() is fine.
  const rows = db
    .prepare(
      `SELECT rowid, ${blob.column} AS ct FROM ${blob.table} WHERE ${blob.column} IS NOT NULL`,
    )
    .all() as Array<{ rowid: number; ct: string }>
  const update = db.prepare(`UPDATE ${blob.table} SET ${blob.column} = ? WHERE rowid = ?`)
  let rotated = 0
  let skipped = 0
  for (const row of rows) {
    const next = reencryptCiphertext(
      row.ct,
      blob.salt,
      oldSecret,
      newSecret,
      `${blob.table}.${blob.column} rowid=${row.rowid}`,
    )
    if (next === null) {
      skipped += 1
      continue
    }
    update.run(next, row.rowid)
    rotated += 1
  }
  return { rotated, skipped }
}

/**
 * Re-encrypt one ciphertext under the new secret. Returns the new base64
 * ciphertext, or `null` when the row is already on the new key (skip — a
 * re-run of a partially-completed rotation). Throws if neither key decrypts.
 * Dialect-agnostic: the crypto is identical on SQLite and Postgres.
 */
function reencryptCiphertext(
  ct: string,
  salt: string,
  oldSecret: string,
  newSecret: string,
  where: string,
): string | null {
  let plaintext: string
  try {
    plaintext = decrypt(ct, oldSecret, salt)
  } catch {
    try {
      decrypt(ct, newSecret, salt)
      return null
    } catch {
      throw new Error(
        `${where}: decrypt failed with both --old and --new secrets. Refusing to ` +
          `continue. The row was likely encrypted with a third key — restore from a ` +
          `backup and try again.`,
      )
    }
  }
  return encrypt(plaintext, newSecret, salt)
}

function tableExists(db: Database.Database, table: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(table) as { name?: string } | undefined
  return !!row?.name
}

function assertNoLiveWriter(dbPath: string): void {
  const abs = resolve(dbPath)
  for (const suffix of ['-wal', '-shm']) {
    const sibling = `${abs}${suffix}`
    if (!existsSync(sibling)) continue
    const ageMs = Date.now() - statSync(sibling).mtimeMs
    if (ageMs < WAL_FRESH_THRESHOLD_MS) {
      throw new Error(
        `${sibling} was modified ${Math.round(ageMs / 1000)}s ago — a writer is still ` +
          `attached. Stop the service before rotating: ` +
          `\`docker compose stop integration-server admin-api webhook-gateway\``,
      )
    }
  }
}

/**
 * Postgres variant: rotate every encrypted column in a single Postgres
 * database. Uses `ctid` — the physical row identifier, Postgres's analog of
 * SQLite's `rowid` — so no per-table primary-key knowledge is needed (each
 * row is selected then updated exactly once, by its original ctid, within one
 * transaction with no concurrent writers). The whole rotation is one
 * transaction, so a partial failure rolls back. Stop services first, and take
 * a snapshot before rotating — a wrong-key rotation is only recoverable from a
 * backup (managed Postgres: an RDS/Cloud SQL snapshot; self-hosted: pg_dump).
 */
export async function rotateStoreSecretPostgres(args: {
  oldSecret: string
  newSecret: string
  databaseUrl: string
}): Promise<RotationStats> {
  if (!args.oldSecret) throw new Error('--old <secret> is required')
  if (!args.newSecret) throw new Error('--new <secret> is required')
  if (args.oldSecret === args.newSecret) {
    throw new Error('--old and --new must differ — refusing to rotate to the same key')
  }

  const { Pool } = await import('pg')
  const pool = new Pool({
    connectionString: args.databaseUrl,
    max: 2,
    connectionTimeoutMillis: 5000,
  })
  const client = await pool.connect()
  const stats: RotationStats = { rowsRotated: 0, rowsSkipped: 0, perBlob: [] }
  try {
    await client.query('BEGIN')
    for (const blob of ALL_BLOBS) {
      if (!(await pgTableExists(client, blob.table))) continue
      const res = await client.query<{ ctid: string; ct: string }>(
        `SELECT ctid::text AS ctid, ${blob.column} AS ct FROM ${blob.table} WHERE ${blob.column} IS NOT NULL`,
      )
      let rotated = 0
      let skipped = 0
      for (const row of res.rows) {
        const next = reencryptCiphertext(
          row.ct,
          blob.salt,
          args.oldSecret,
          args.newSecret,
          `${blob.table}.${blob.column} ctid=${row.ctid}`,
        )
        if (next === null) {
          skipped += 1
          continue
        }
        await client.query(`UPDATE ${blob.table} SET ${blob.column} = $1 WHERE ctid = $2::tid`, [
          next,
          row.ctid,
        ])
        rotated += 1
      }
      stats.perBlob.push({ table: blob.table, column: blob.column, rotated, skipped })
      stats.rowsRotated += rotated
      stats.rowsSkipped += skipped
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
    await pool.end()
  }
  return stats
}

async function pgTableExists(client: PoolClient, table: string): Promise<boolean> {
  const res = await client.query<{ t: string | null }>('SELECT to_regclass($1) AS t', [
    `public.${table}`,
  ])
  return res.rows[0]?.t != null
}

// ── CLI entry point ──────────────────────────────────────────────────────

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { oldSecret: '', newSecret: '', dbPaths: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--old') args.oldSecret = argv[++i] ?? ''
    else if (a === '--new') args.newSecret = argv[++i] ?? ''
    else if (a === '--db') args.dbPaths.push(argv[++i] ?? '')
    else if (a === '--database-url') args.databaseUrl = argv[++i] ?? ''
    else if (a === '--unsafe-allow-live-db') args.unsafeAllowLiveDb = true
    else if (a === '--help' || a === '-h') {
      printUsage()
      process.exit(0)
    } else {
      throw new Error(`unknown argument: ${a}`)
    }
  }
  return args
}

function printUsage(): void {
  process.stdout.write(
    [
      'rotate-store-secret — re-encrypt every encrypted-at-rest column under a new STORE_SECRET',
      '',
      'Usage:',
      '  SQLite:   pnpm rotate-store-secret --old <secret> --new <secret> --db <path> [--db <path> ...]',
      '  Postgres: pnpm rotate-store-secret --old <secret> --new <secret> --database-url <postgres://…>',
      '',
      'Stop services before running. The tool refuses to run against a live SQLite db.',
      '',
      'After rotation:',
      '  - Update STORE_SECRET in .env / compose env',
      '  - Restart services',
      `  - Re-issue every row in: ${HASH_ONLY_STORES.join(', ')}`,
      '    (these are hashed with STORE_SECRET in the KDF salt; rotation invalidates them)',
      '',
    ].join('\n'),
  )
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))
  if (args.databaseUrl && args.dbPaths.length > 0) {
    throw new Error('pass either --database-url (Postgres) or --db (SQLite), not both')
  }

  let totalRotated = 0
  let totalSkipped = 0
  const printDb = (label: string, perBlob: RotationStats['perBlob']): void => {
    process.stdout.write(`\n${label}\n`)
    for (const b of perBlob) {
      process.stdout.write(`  ${b.table}.${b.column}: rotated=${b.rotated} skipped=${b.skipped}\n`)
    }
  }

  if (args.databaseUrl) {
    const dbStats = await rotateStoreSecretPostgres({
      oldSecret: args.oldSecret,
      newSecret: args.newSecret,
      databaseUrl: args.databaseUrl,
    })
    printDb('postgres', dbStats.perBlob)
    totalRotated += dbStats.rowsRotated
    totalSkipped += dbStats.rowsSkipped
    process.stdout.write(
      `\nDone. rotated=${totalRotated} skipped=${totalSkipped}\n` +
        `No automatic backup was taken — restore from your snapshot (RDS/Cloud SQL/pg_dump) ` +
        `only if you rotated to the wrong key.\n` +
        `Next: update STORE_SECRET in your env and start services.\n` +
        `Re-issue rows in: ${HASH_ONLY_STORES.join(', ')} (hashed; rotation invalidates them).\n`,
    )
    return
  }

  const stats = rotateStoreSecret(args)
  for (const [dbPath, dbStats] of Object.entries(stats)) {
    printDb(dbPath, dbStats.perBlob)
    totalRotated += dbStats.rowsRotated
    totalSkipped += dbStats.rowsSkipped
  }
  process.stdout.write(
    `\nDone. rotated=${totalRotated} skipped=${totalSkipped}\n` +
      `Backups: <db>.pre-rotation.bak (one per --db)\n` +
      `Next: update STORE_SECRET in your env and start services.\n` +
      `Re-issue rows in: ${HASH_ONLY_STORES.join(', ')} (hashed; rotation invalidates them).\n`,
  )
}

// Only invoke main() when this file is the script entry point, not when
// imported by tests.
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] != null &&
  (process.argv[1].endsWith('rotate-store-secret.ts') ||
    process.argv[1].endsWith('rotate-store-secret.js') ||
    process.argv[1].endsWith('rotate-store-secret'))
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`)
    process.exit(1)
  })
}
