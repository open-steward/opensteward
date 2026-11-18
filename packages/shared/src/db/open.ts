/**
 * `openDb()` factory.
 *
 * A non-empty `databaseUrl` selects Postgres; otherwise SQLite at `sqlitePath`.
 * Both return through the async signature (Postgres needs a pool connect, and
 * both load the ESM-only kysely via dynamic import).
 */
import type { DbHandle, OpenDbOptions } from './types'
import { SqliteDbHandle } from './sqlite'
import { PostgresDbHandle } from './postgres'

export function openDb(opts: OpenDbOptions): Promise<DbHandle> {
  const url = opts.databaseUrl?.trim()
  if (url) {
    return PostgresDbHandle.open(url, opts.poolMax ?? 10)
  }
  if (!opts.sqlitePath) {
    return Promise.reject(new Error('openDb: sqlitePath is required for the SQLite backend'))
  }
  return SqliteDbHandle.open(opts.sqlitePath)
}
