/**
 * Dialect-agnostic SQL error classification.
 *
 * Stores that use "attempt the insert, catch the duplicate" as control flow
 * need to recognise a unique/primary-key violation across both backends:
 *   - Postgres (node-postgres): `error.code === '23505'`.
 *   - SQLite (better-sqlite3): `error.code` is `SQLITE_CONSTRAINT_UNIQUE` /
 *     `SQLITE_CONSTRAINT_PRIMARYKEY` (older builds: a generic
 *     `SQLITE_CONSTRAINT` with a "UNIQUE constraint failed" message).
 * Kysely propagates the raw driver error for both dialects.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const code = (err as { code?: unknown }).code

  if (code === '23505') return true

  if (typeof code === 'string' && code.startsWith('SQLITE_CONSTRAINT')) {
    if (code.includes('UNIQUE') || code.includes('PRIMARYKEY')) return true
    const msg = (err as { message?: unknown }).message
    return typeof msg === 'string' && /unique constraint failed/i.test(msg)
  }

  return false
}
