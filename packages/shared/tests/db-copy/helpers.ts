/**
 * Test sides for db-copy: a SQLite file in a temp dir, or — when
 * TEST_DATABASE_URL is set — a throwaway Postgres SCHEMA, selected with
 * `options=-c search_path=<schema>` on the URL, dropped afterwards.
 *
 * A schema of its own rather than `public`, so these files cannot collide
 * with the suites that reset `public` per file, whatever the parallelism. Not
 * a database of its own: pg-pool's end() destroys idle sockets without a
 * Terminate message, the backend lingers behind Docker's port proxy, and a
 * `DROP DATABASE … WITH (FORCE)` then lands a FATAL on the closing pool as an
 * unhandled 'error' event. Dropping a schema terminates nobody.
 */
import { randomBytes } from 'crypto'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { Client } from 'pg'
import { openDb, type DbHandle } from '../../src/db'
import type { Endpoint } from '../../src/db-copy'

export const PG_BASE = process.env.TEST_DATABASE_URL

export type Kind = 'sqlite' | 'postgres'

export interface Side {
  kind: Kind
  endpoint: Endpoint
  /** A DbHandle on this side (caller closes it). */
  open(): Promise<DbHandle>
  exists(): boolean
  cleanup(): Promise<void>
}

export const DIRECTIONS: Array<[Kind, Kind]> = [['sqlite', 'sqlite']]
if (PG_BASE) {
  DIRECTIONS.push(['sqlite', 'postgres'], ['postgres', 'sqlite'], ['postgres', 'postgres'])
}

let tmpRoot: string | undefined
function tmp(): string {
  tmpRoot ??= mkdtempSync(join(tmpdir(), 'db-copy-test-'))
  return tmpRoot
}

async function onBase(sql: string): Promise<void> {
  const c = new Client({ connectionString: PG_BASE })
  await c.connect()
  try {
    await c.query(sql)
  } finally {
    await c.end()
  }
}

/** A Postgres URL on TEST_DATABASE_URL's database whose search_path is `schema`. */
export function schemaUrl(schema: string): string {
  const u = new URL(PG_BASE!)
  u.searchParams.set('options', `-c search_path=${schema}`)
  return u.toString()
}

export async function makeSide(kind: Kind): Promise<Side> {
  if (kind === 'sqlite') {
    const path = join(tmp(), `${randomBytes(6).toString('hex')}.db`)
    return {
      kind,
      endpoint: { kind: 'sqlite', path },
      open: () => openDb({ sqlitePath: path }),
      exists: () => existsSync(path),
      cleanup: () => {
        const dir = tmp()
        const base = path.slice(dir.length + 1)
        for (const f of readdirSync(dir))
          if (f.startsWith(base)) rmSync(join(dir, f), { force: true })
        return Promise.resolve()
      },
    }
  }
  if (!PG_BASE) throw new Error('postgres side needs TEST_DATABASE_URL')
  const schema = `dbcopy_${randomBytes(6).toString('hex')}`
  await onBase(`CREATE SCHEMA ${schema}`)
  const url = schemaUrl(schema)
  return {
    kind,
    endpoint: { kind: 'postgres', url },
    open: () => openDb({ databaseUrl: url, poolMax: 2 }),
    exists: () => true,
    cleanup: () => onBase(`DROP SCHEMA IF EXISTS ${schema} CASCADE`),
  }
}

export function removeTmpRoot(): void {
  if (tmpRoot) rmSync(tmpRoot, { recursive: true, force: true })
  tmpRoot = undefined
}

/** Run a query on a side with the raw driver; rows as objects. */
export async function query<T = Record<string, unknown>>(side: Side, text: string): Promise<T[]> {
  if (side.endpoint.kind === 'postgres') {
    const c = new Client({ connectionString: side.endpoint.url })
    await c.connect()
    try {
      return (await c.query(text)).rows as T[]
    } finally {
      await c.end()
    }
  }
  const { default: Database } = await import('better-sqlite3')
  const db = new Database(side.endpoint.path)
  try {
    return db.prepare(text).all() as T[]
  } finally {
    db.close()
  }
}

/** Execute a (multi-statement) script on a side. */
export async function exec(side: Side, sql: string): Promise<void> {
  const h = await side.open()
  try {
    await h.execScript(sql)
  } finally {
    await h.close()
  }
}
