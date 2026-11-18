/**
 * db-copy with integration-server's real profiles (dist/db-copy.js in the
 * image): credentials.db and resources.db ⇄ Postgres.
 *
 * The drift net comes first: every store server.ts opens on `credHandle` /
 * `dataHandle` must be in the matching profile, or a Postgres → SQLite copy
 * would silently leave that store's tables behind (on Postgres both families
 * share one database with admin-api, so there is no "unknown table" check to
 * catch it at copy time; a SQLite source does get that check).
 *
 * Then a copy through each full profile. SQLite → SQLite always; the Postgres
 * directions with TEST_DATABASE_URL (`pnpm test:pg` runs this file), each
 * Postgres side in a throwaway schema.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import {
  CredentialStore,
  ResourceStore,
  SyncStore,
  openDb,
  type DbHandle,
} from '@opensteward/shared'
import {
  callsReceiving,
  copyDatabase,
  recordProfile,
  type Endpoint,
} from '@opensteward/shared/db-copy'
import { CREDENTIALS_DB_PROFILE, RESOURCES_DB_PROFILE } from '../../src/db-copy'

const PG = process.env.TEST_DATABASE_URL
type Kind = 'sqlite' | 'postgres'
const DIRECTIONS: Array<[Kind, Kind]> = [['sqlite', 'sqlite']]
if (PG) DIRECTIONS.push(['sqlite', 'postgres'], ['postgres', 'sqlite'])

const SECRET = 'integration-server-db-copy-test-secret-0123456789'
const dir = mkdtempSync(join(tmpdir(), 'is-db-copy-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function onPg(sql: string): Promise<void> {
  const h = await openDb({ databaseUrl: PG, poolMax: 1 })
  try {
    await h.execScript(sql)
  } finally {
    await h.close()
  }
}

async function side(kind: Kind): Promise<{ endpoint: Endpoint; open(): Promise<DbHandle> }> {
  if (kind === 'sqlite') {
    const path = join(dir, `${randomBytes(6).toString('hex')}.db`)
    return { endpoint: { kind: 'sqlite', path }, open: () => openDb({ sqlitePath: path }) }
  }
  const schema = `dbcopy_${randomBytes(6).toString('hex')}`
  await onPg(`CREATE SCHEMA ${schema}`)
  cleanups.push(() => onPg(`DROP SCHEMA IF EXISTS ${schema} CASCADE`))
  const u = new URL(PG!)
  u.searchParams.set('options', `-c search_path=${schema}`)
  const url = u.toString()
  return {
    endpoint: { kind: 'postgres', url },
    open: () => openDb({ databaseUrl: url, poolMax: 2 }),
  }
}

// Calls in server.ts that receive a handle but are deliberately NOT in a
// profile, each with its reason. A new store taking the handle in any shape —
// positional, object literal, constructor — fails the tests below until it is
// either added to the profile or listed here.
const NOT_COPIED: Record<string, { handle: 'credHandle' | 'dataHandle'; why: string }> = {
  AnalyticsService: {
    handle: 'credHandle',
    why: 'SQL-access principals (analytics namespace): Postgres-only, describe Postgres roles',
  },
}

function excluded(handle: 'credHandle' | 'dataHandle'): string[] {
  return Object.entries(NOT_COPIED)
    .filter(([, v]) => v.handle === handle)
    .map(([k]) => k)
}

describe('integration-server db-copy profiles', () => {
  const server = readFileSync(resolve(__dirname, '../../src/server.ts'), 'utf8')
  const profiles = readFileSync(resolve(__dirname, '../../src/db-copy.ts'), 'utf8')
  const [credSrc, dataSrc] = profiles.split('export const RESOURCES_DB_PROFILE')

  it('credentials opens every store server.ts hands credHandle, except the listed ones', () => {
    const booted = callsReceiving(server, 'credHandle')
    expect(booted.length).toBeGreaterThan(5)
    expect([...callsReceiving(credSrc!, 'handle'), ...excluded('credHandle')].sort()).toEqual(
      booted,
    )
  })

  it('resources opens every store server.ts hands dataHandle, except the listed ones', () => {
    const booted = callsReceiving(server, 'dataHandle')
    expect(booted.length).toBeGreaterThan(1)
    expect([...callsReceiving(dataSrc!, 'handle'), ...excluded('dataHandle')].sort()).toEqual(
      booted,
    )
  })

  it('records disjoint namespaces for the two families', async () => {
    const cred = await recordProfile(CREDENTIALS_DB_PROFILE)
    const data = await recordProfile(RESOURCES_DB_PROFILE)
    const credNs = cred.namespaces.map((n) => n.namespace)
    const dataNs = data.namespaces.map((n) => n.namespace)
    expect(credNs).toEqual(
      expect.arrayContaining(['credentials', 'developer_api_keys', 'end_users', 'license_state']),
    )
    expect(dataNs).toEqual(['resources', 'sync_jobs', 'destinations'])
    // On Postgres both families share one database: no namespace or table may
    // belong to both, or copying one would clear the other's rows.
    expect(credNs.filter((n) => dataNs.includes(n))).toEqual([])
    expect(cred.tables.filter((t) => data.tables.includes(t))).toEqual([])
  })
})

describe.each(DIRECTIONS)('integration-server db-copy %s → %s', (fromKind, toKind) => {
  it('copies both databases through the full profiles', async () => {
    const credFrom = await side(fromKind)
    const dataFrom = await side(fromKind)
    // On Postgres both families live in ONE database: copy them into the same
    // target, one profile after the other, as switch-db.sh does.
    const credTo = await side(toKind)
    const dataTo = toKind === 'postgres' ? credTo : await side(toKind)

    const c = await credFrom.open()
    let connId: string
    try {
      await CREDENTIALS_DB_PROFILE.open(c)
      const store = await CredentialStore.create(c, SECRET)
      connId = await store.create('xero', 't1', { accessToken: 'tok' }, 'Main', 'accounting', 't1')
    } finally {
      await c.close()
    }
    const d = await dataFrom.open()
    let jobId: string
    try {
      await RESOURCES_DB_PROFILE.open(d)
      const rs = await ResourceStore.create(d)
      await rs.upsert('accounting', 'xero', 't1', 'invoices', 'inv-1', { id: 'inv-1', total: 10 })
      jobId = (await (await SyncStore.create(d)).create('accounting', connId, 'xero', 't1', null))
        .id
    } finally {
      await d.close()
    }

    const cred = await copyDatabase({
      profile: CREDENTIALS_DB_PROFILE,
      from: credFrom.endpoint,
      to: credTo.endpoint,
      log: () => {},
    })
    const data = await copyDatabase({
      profile: RESOURCES_DB_PROFILE,
      from: dataFrom.endpoint,
      to: dataTo.endpoint,
      log: () => {},
    })
    expect(cred.tables.find((t) => t.table === 'credentials')?.copied).toBe(1)
    expect(data.tables.find((t) => t.table === 'resources')?.copied).toBe(1)

    const t = await credTo.open()
    try {
      expect(await (await CredentialStore.create(t, SECRET)).loadById(connId)).toMatchObject({
        accessToken: 'tok',
      })
    } finally {
      await t.close()
    }
    const u = await dataTo.open()
    try {
      const rs = await ResourceStore.create(u)
      expect(await rs.get('accounting', 'xero', 't1', 'invoices', 'inv-1')).toEqual({
        id: 'inv-1',
        total: 10,
      })
      expect((await (await SyncStore.create(u)).get(jobId))?.connectionId).toBe(connId)
    } finally {
      await u.close()
    }
  })
})
