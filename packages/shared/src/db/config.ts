/**
 * Backend selection from the environment.
 *
 * `DATABASE_URL` set and non-empty → Postgres; otherwise SQLite at the
 * caller-supplied path. A malformed `DATABASE_URL` fails closed rather than
 * silently falling back to SQLite — a silent fallback in a multi-replica
 * deploy would split data across pods.
 */
import type { ResolvedDbConfig } from './types'

const PG_URL = /^postgres(ql)?:\/\//i

export function resolveDbConfig(
  env: NodeJS.ProcessEnv = process.env,
  opts: { sqlitePath?: string } = {},
): ResolvedDbConfig {
  const url = (env.DATABASE_URL ?? '').trim()
  const poolEnv = Number(env.DATABASE_POOL_MAX)
  const poolMax = Number.isFinite(poolEnv) && poolEnv > 0 ? poolEnv : 10

  if (url) {
    if (!PG_URL.test(url)) {
      throw new Error(
        'DATABASE_URL must be a postgres:// (or postgresql://) connection string. ' +
          'Unset it to use the SQLite backend.',
      )
    }
    return { dialect: 'postgres', databaseUrl: url, poolMax }
  }

  return { dialect: 'sqlite', sqlitePath: opts.sqlitePath, poolMax }
}
