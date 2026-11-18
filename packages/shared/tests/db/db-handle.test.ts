import { describe, it, expect, afterEach } from 'vitest'
import { openDb, resolveDbConfig } from '../../src/db'
import type { DbHandle, DualMigration } from '../../src/db'

// Portable DDL: `INTEGER PRIMARY KEY` + `TEXT` behave identically on SQLite and
// Postgres (INTEGER round-trips as a JS number on both), so the seam tests make
// the same assertions against either backend. Dialect-divergent DDL
// (AUTOINCREMENT→IDENTITY, etc.) is exercised by the real stores' own tests.
const MIGS: DualMigration[] = [
  {
    version: 1,
    sqlite: 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)',
    postgres: 'CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)',
  },
  {
    version: 2,
    sqlite: 'ALTER TABLE t ADD COLUMN note TEXT',
    postgres: 'ALTER TABLE t ADD COLUMN note TEXT',
  },
]

// SQLite always runs (`:memory:` gives a fresh db per open). Postgres runs only
// when TEST_DATABASE_URL points at a reachable server (CI service container /
// local docker); the suite drops its tables per test so the shared db stays
// isolated.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

async function freshHandle(open: () => Promise<DbHandle>): Promise<DbHandle> {
  const h = await open()
  // No-op for SQLite `:memory:`; resets shared state for the Postgres db.
  await h.execScript(
    'DROP TABLE IF EXISTS t; DROP TABLE IF EXISTS a; DROP TABLE IF EXISTS b; DROP TABLE IF EXISTS _schema_migrations',
  )
  return h
}

let handle: DbHandle | undefined
afterEach(async () => {
  await handle?.close()
  handle = undefined
})

describe('resolveDbConfig', () => {
  it('defaults to sqlite when DATABASE_URL is unset', () => {
    expect(resolveDbConfig({}, { sqlitePath: '/tmp/x.db' })).toMatchObject({
      dialect: 'sqlite',
      sqlitePath: '/tmp/x.db',
      poolMax: 10,
    })
  })

  it('selects postgres for a postgres:// url', () => {
    expect(resolveDbConfig({ DATABASE_URL: 'postgres://u@h/db' })).toMatchObject({
      dialect: 'postgres',
      databaseUrl: 'postgres://u@h/db',
    })
  })

  it('honours DATABASE_POOL_MAX', () => {
    expect(resolveDbConfig({ DATABASE_URL: 'postgresql://u@h/db', DATABASE_POOL_MAX: '25' }).poolMax).toBe(25)
  })

  it('fails closed on a non-postgres DATABASE_URL', () => {
    expect(() => resolveDbConfig({ DATABASE_URL: 'mysql://x' })).toThrow(/postgres/)
  })
})

describe('openDb — Postgres reachability', () => {
  it('fails closed when Postgres is unreachable', async () => {
    await expect(
      openDb({ databaseUrl: 'postgres://user:pass@127.0.0.1:1/nope' }),
    ).rejects.toThrow(/cannot connect to Postgres/i)
  })
})

describe.each(BACKENDS)('DbHandle [$name]', (backend) => {
  it('reports its dialect', async () => {
    handle = await freshHandle(backend.open)
    expect(handle.dialect).toBe(backend.name)
  })

  it('applies migrations, is idempotent, and round-trips via kysely', async () => {
    handle = await freshHandle(backend.open)

    const r1 = await handle.migrate('demo', MIGS)
    expect(r1).toMatchObject({ fromVersion: 0, toVersion: 2, applied: [1, 2] })

    const r2 = await handle.migrate('demo', MIGS)
    expect(r2).toMatchObject({ fromVersion: 2, toVersion: 2, applied: [] })

    await handle.kysely.insertInto('t').values({ id: 1, name: 'a', note: 'n' }).execute()
    const rows = await handle.kysely.selectFrom('t').selectAll().execute()
    expect(rows).toEqual([{ id: 1, name: 'a', note: 'n' }])
  })

  it('fails closed when the db is newer than the binary', async () => {
    handle = await freshHandle(backend.open)
    await handle.migrate('demo', MIGS)
    await expect(handle.migrate('demo', [MIGS[0]])).rejects.toThrow(/newer schema/)
  })

  it('rejects non-contiguous migrations', async () => {
    handle = await freshHandle(backend.open)
    await expect(
      handle.migrate('demo', [{ version: 2, sqlite: '', postgres: '' }]),
    ).rejects.toThrow(/contiguous/)
  })

  it('commits work inside a transaction', async () => {
    handle = await freshHandle(backend.open)
    await handle.migrate('demo', MIGS)
    await handle.transaction(async (tx) => {
      await tx.insertInto('t').values({ id: 1, name: 'x' }).execute()
      await tx.insertInto('t').values({ id: 2, name: 'y' }).execute()
    })
    const rows = await handle.kysely.selectFrom('t').selectAll().execute()
    expect(rows.length).toBe(2)
  })

  it('runs a multi-statement script via execScript', async () => {
    handle = await freshHandle(backend.open)
    await handle.execScript('CREATE TABLE a (id INTEGER); CREATE TABLE b (id INTEGER)')
    await handle.kysely.insertInto('a').values({ id: 1 }).execute()
    await handle.kysely.insertInto('b').values({ id: 2 }).execute()
    expect(await handle.kysely.selectFrom('a').selectAll().execute()).toEqual([{ id: 1 }])
    expect(await handle.kysely.selectFrom('b').selectAll().execute()).toEqual([{ id: 2 }])
  })
})

// Postgres-only: HA boots several replicas at once against ONE shared database, so
// their migrate() calls race. The advisory lock in applyPostgresMigrations must make
// them serialize — no duplicate-key crash on the (namespace, version) tracker, and
// each version applied exactly once. SQLite is single-writer (`:memory:` is per-open),
// so the race cannot occur there and the test is skipped.
const describePg = process.env.TEST_DATABASE_URL ? describe : describe.skip
describePg('applyPostgresMigrations — concurrent boots', () => {
  const open = () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL })

  it('serializes racing replicas: no crash, each version applied exactly once', async () => {
    const reset = await open()
    await reset.execScript('DROP TABLE IF EXISTS t; DROP TABLE IF EXISTS _schema_migrations')
    await reset.close()

    // Simulate N replicas booting simultaneously, each with its own pool.
    const replicas = await Promise.all(Array.from({ length: 8 }, () => open()))
    try {
      const reports = await Promise.all(replicas.map((h) => h.migrate('concurrent', MIGS)))

      // Every version is claimed by exactly one replica (no double-apply, none lost).
      const appliedAll = reports.flatMap((r) => r.applied).sort((a, b) => a - b)
      expect(appliedAll).toEqual([1, 2])
      // Every replica converges on the final version.
      expect(reports.every((r) => r.toVersion === 2)).toBe(true)

      // The schema is intact and usable from any replica.
      await replicas[0].kysely.insertInto('t').values({ id: 1, name: 'a', note: 'n' }).execute()
      expect(await replicas[0].kysely.selectFrom('t').selectAll().execute()).toEqual([
        { id: 1, name: 'a', note: 'n' },
      ])
    } finally {
      await Promise.all(replicas.map((h) => h.close()))
    }
  })
})
