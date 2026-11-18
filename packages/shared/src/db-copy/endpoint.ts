/**
 * Where a copy reads from or writes to.
 *
 *   sqlite:<path>              a SQLite file (relative paths resolve from cwd)
 *   postgres://… | postgresql://…
 *   env:<NAME>                 the value of environment variable NAME, parsed
 *                              as one of the above. Keeps a password off the
 *                              command line (and out of `ps` / shell history);
 *                              inside a service container `env:DATABASE_URL`
 *                              is the service's own database.
 */
import { resolve } from 'path'
import { DbCopyError } from './errors'

export type Endpoint = { kind: 'sqlite'; path: string } | { kind: 'postgres'; url: string }

const PG_URL = /^postgres(ql)?:\/\//i

export function parseEndpoint(spec: string, env: NodeJS.ProcessEnv = process.env): Endpoint {
  let value = spec.trim()
  if (value.startsWith('env:')) {
    const name = value.slice(4)
    const fromEnv = env[name]?.trim()
    if (!name || !fromEnv) {
      throw new DbCopyError(
        'USAGE',
        `${spec}: environment variable ${name || '(empty)'} is not set`,
      )
    }
    value = fromEnv
  }
  if (PG_URL.test(value)) return { kind: 'postgres', url: value }
  if (value.startsWith('sqlite:')) {
    const path = value.slice('sqlite:'.length)
    if (!path)
      throw new DbCopyError('USAGE', 'sqlite: needs a file path, e.g. sqlite:/data/admin.db')
    if (path === ':memory:')
      throw new DbCopyError('USAGE', 'sqlite::memory: is not a copyable database')
    return { kind: 'sqlite', path: resolve(path) }
  }
  throw new DbCopyError(
    'USAGE',
    `unrecognised endpoint '${spec.startsWith('env:') ? spec : redactUrl(spec)}': use sqlite:<path>, postgres://… or env:<NAME>`,
  )
}

/** A printable description that never includes credentials. */
export function describeEndpoint(ep: Endpoint): string {
  return ep.kind === 'sqlite' ? `sqlite ${ep.path}` : `postgres ${redactUrl(ep.url)}`
}

/** `postgres://user:pass@host:5432/db?x` → `postgres://host:5432/db`. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url)
    const port = u.port ? `:${u.port}` : ''
    return `${u.protocol}//${u.hostname}${port}${u.pathname}`
  } catch {
    return '<unparseable url>'
  }
}

/**
 * Best-effort "is this the same database?" — host, port, database, and the
 * `options` parameter (a `-c search_path=…` there selects another schema).
 */
export function sameEndpoint(a: Endpoint, b: Endpoint): boolean {
  if (a.kind === 'sqlite' && b.kind === 'sqlite') return resolve(a.path) === resolve(b.path)
  if (a.kind === 'postgres' && b.kind === 'postgres') {
    const options = (url: string): string => {
      try {
        return new URL(url).searchParams.get('options') ?? ''
      } catch {
        return ''
      }
    }
    return redactUrl(a.url) === redactUrl(b.url) && options(a.url) === options(b.url)
  }
  return false
}
