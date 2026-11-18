/**
 * Backups taken before a copy writes to an existing target.
 *
 * SQLite: better-sqlite3's online backup of the whole file (sqlite-conn.ts).
 * Postgres: `pg_dump --format=custom` of this database profile's tables only,
 * when a pg_dump binary is available. The service images carry none, so there
 * the caller either dumps the database another way (scripts/switch-db.sh runs
 * pg_dump inside the postgres container) and passes --no-backup, or the copy
 * refuses. The connection goes to pg_dump through PG* environment variables,
 * never its command line, so the password is not visible in `ps`.
 */
import { spawnSync } from 'child_process'
import { closeSync, openSync, unlinkSync } from 'fs'
import { DbCopyError } from './errors'

/** True when `bin` runs (`<bin> --version` exits 0). */
export function pgDumpAvailable(bin: string): boolean {
  const r = spawnSync(bin, ['--version'], { stdio: 'ignore' })
  return !r.error && r.status === 0
}

/** libpq environment for a postgres:// URL (host, port, user, password, db, options, sslmode). */
export function libpqEnv(url: string): NodeJS.ProcessEnv {
  const u = new URL(url)
  const env: NodeJS.ProcessEnv = { ...process.env }
  env['PGHOST'] = u.hostname.replace(/^\[(.*)\]$/, '$1')
  if (u.port) env['PGPORT'] = u.port
  if (u.username) env['PGUSER'] = decodeURIComponent(u.username)
  if (u.password) env['PGPASSWORD'] = decodeURIComponent(u.password)
  env['PGDATABASE'] = decodeURIComponent(u.pathname.replace(/^\//, ''))
  const options = u.searchParams.get('options')
  if (options) env['PGOPTIONS'] = options
  const sslmode = u.searchParams.get('sslmode')
  if (sslmode) env['PGSSLMODE'] = sslmode
  return env
}

/**
 * Dump `tables` (in `schema`) to `file`, created owner-only first so the dump
 * — encrypted credentials, PII — is never readable by anyone else.
 */
export function pgDumpTables(opts: {
  bin: string
  url: string
  schema: string
  tables: string[]
  file: string
}): void {
  closeSync(openSync(opts.file, 'wx', 0o600))
  const r = spawnSync(
    opts.bin,
    [
      '--format=custom',
      '--no-owner',
      `--file=${opts.file}`,
      ...opts.tables.map((t) => `--table=${opts.schema}.${t}`),
    ],
    { env: libpqEnv(opts.url), stdio: ['ignore', 'ignore', 'pipe'], encoding: 'utf8' },
  )
  if (r.error || r.status !== 0) {
    try {
      unlinkSync(opts.file)
    } catch {
      /* best effort */
    }
    const why = r.error ? r.error.message : (r.stderr ?? '').split('\n')[0] || `exit ${r.status}`
    throw new DbCopyError(
      'BACKUP_REQUIRED',
      `pg_dump of the target failed (${why}); nothing was written. Fix pg_dump, or dump the ` +
        `database yourself and re-run with --no-backup.`,
    )
  }
}
