/**
 * db-copy failure modes, each with its own process exit code so a wrapper
 * (scripts/switch-db.sh) can tell "refused, nothing touched" apart from
 * "failed mid-copy, rolled back".
 */
export type DbCopyErrorCode =
  | 'USAGE'
  | 'FAILED'
  | 'ROW_COUNT_MISMATCH'
  | 'TARGET_NOT_EMPTY'
  | 'SCHEMA_MISMATCH'
  | 'SOURCE_MISSING'
  | 'BACKUP_REQUIRED'

export const EXIT_CODES: Record<DbCopyErrorCode, number> = {
  // A copy that ran and was rolled back (driver error, bad value, …).
  FAILED: 1,
  // Verification failed after the rows were written; the transaction was
  // rolled back, so the target is exactly as it was.
  ROW_COUNT_MISMATCH: 1,
  USAGE: 2,
  // Refusals: nothing was written.
  TARGET_NOT_EMPTY: 3,
  SCHEMA_MISMATCH: 4,
  SOURCE_MISSING: 5,
  // The target holds rows that --overwrite would replace, and no backup can
  // be taken here (no pg_dump); pass --no-backup after backing it up yourself.
  BACKUP_REQUIRED: 6,
}

export class DbCopyError extends Error {
  readonly code: DbCopyErrorCode
  constructor(code: DbCopyErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'DbCopyError'
    this.code = code
  }
  get exitCode(): number {
    return EXIT_CODES[this.code]
  }
}

/**
 * Describe a driver error WITHOUT the row data it may carry.
 *
 * node-postgres puts the offending row or key in `detail` ("Key (id)=(…)
 * already exists", "Failing row contains (…)") and some messages end in the
 * rejected value (`invalid input syntax for type bigint: "…"`). Encrypted
 * credential columns go through this path, so neither is ever printed: we
 * keep the message minus a trailing quoted value, plus the SQLSTATE and the
 * constraint / column / table names, which are schema, not data.
 * better-sqlite3 messages ("UNIQUE constraint failed: t.id") carry no values.
 */
export function describeDriverError(err: unknown): string {
  if (!(err instanceof Error)) return 'unknown error'
  const e = err as Error & {
    code?: unknown
    constraint?: unknown
    column?: unknown
    table?: unknown
    severity?: unknown
  }
  let msg = e.message.replace(/:\s*"[\s\S]*"\s*$/, ': <value withheld>')
  // Belt and braces: never let a multi-line message (which some drivers use
  // for context) through.
  msg = msg.split('\n')[0] ?? msg
  const parts: string[] = []
  if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) parts.push(`SQLSTATE ${e.code}`)
  else if (typeof e.code === 'string') parts.push(e.code)
  if (typeof e.table === 'string') parts.push(`table ${e.table}`)
  if (typeof e.column === 'string') parts.push(`column ${e.column}`)
  if (typeof e.constraint === 'string') parts.push(`constraint ${e.constraint}`)
  return parts.length ? `${msg} (${parts.join(', ')})` : msg
}
