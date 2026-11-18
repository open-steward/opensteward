import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { CredentialStore } from '../../src/auth/store'
import { SyncStore } from '../../src/data-store/sync-store'
import { createSyncStateResolver } from '../../src/data-store/sync-schedule'
import { createUnifiedConnectionsRouter } from '../../src/control-plane/connections-router'

const SECRET = 'connections-router-sync-secret-must-be-32'
const ADMIN = 'admin-secret-for-sync-schedule-tests'
const NOW = 1_800_000_000_000
const MIN = 60_000

let handle: DbHandle
let fastify: FastifyInstance
let store: CredentialStore
let syncStore: SyncStore
let id: string
let prevAdmin: string | undefined

async function build(withState = true) {
  fastify = Fastify({ logger: false })
  await fastify.register(
    createUnifiedConnectionsRouter({
      store,
      ...(withState
        ? {
            syncState: createSyncStateResolver({
              syncStore,
              defaultIntervalMinutes: () => 360,
              now: () => NOW,
            }),
          }
        : {}),
    }),
    { prefix: '/admin' },
  )
  await fastify.ready()
}

beforeEach(async () => {
  prevAdmin = process.env['ADMIN_SECRET']
  process.env['ADMIN_SECRET'] = ADMIN
  handle = await openDb({ sqlitePath: ':memory:' })
  store = await CredentialStore.create(handle, SECRET)
  syncStore = await SyncStore.create(handle)
  id = await store.create('fortnox', null, { accessToken: 't' }, 'Books', 'accounting', 'tenant-a')
  await build()
})

afterEach(async () => {
  await fastify.close()
  await handle.close()
  if (prevAdmin === undefined) delete process.env['ADMIN_SECRET']
  else process.env['ADMIN_SECRET'] = prevAdmin
})

const get = (url: string) =>
  fastify.inject({ method: 'GET', url, headers: { 'x-admin-secret': ADMIN } })
const put = (body: unknown, connectionId = id, secret: string | null = ADMIN) =>
  fastify.inject({
    method: 'PUT',
    url: `/admin/connections/${connectionId}/sync-schedule`,
    headers: secret ? { 'x-admin-secret': secret } : {},
    payload: body as never,
  })

describe('connection sync state', () => {
  it('a never-synced default connection is due now', async () => {
    const data = (await get(`/admin/connections/${id}`)).json().data
    expect(data.syncMode).toBe('default')
    expect(data.sync).toMatchObject({
      mode: 'default',
      effectiveIntervalMinutes: 360,
      defaultIntervalMinutes: 360,
      lastSyncedAt: null,
      nextSyncAt: NOW,
    })
  })

  it('after a sync, the next one is one interval later', async () => {
    const job = await syncStore.create('accounting', id, 'fortnox', null, null)
    await syncStore.markCompleted(job.id, {})
    const { sync } = (await get(`/admin/connections/${id}`)).json().data
    expect(sync.nextSyncAt - sync.lastSyncedAt).toBe(360 * MIN)
  })

  it('every row of the list carries its state', async () => {
    const rows = (await get('/admin/connections')).json().data as Array<{ sync: unknown }>
    expect(rows).toHaveLength(1)
    expect(rows[0]!.sync).toMatchObject({ mode: 'default' })
  })

  it('is null when the router has no resolver (passthrough mode)', async () => {
    await fastify.close()
    await build(false)
    expect((await get(`/admin/connections/${id}`)).json().data.sync).toBeNull()
  })

  // admin-api validates `syncMode` against the enum, so one hand-edited row
  // would fail the whole connections list there.
  it.each([
    ['one', () => `/admin/connections/${id}`],
    ['list', () => '/admin/connections'],
  ])('reads an unknown stored mode as default (%s)', async (_, url) => {
    await handle.kysely
      .updateTable('credentials')
      .set({ sync_mode: 'weekly' })
      .where('id', '=', id)
      .execute()
    const res = await get(url())
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    const row = Array.isArray(data) ? data[0] : data
    expect(row.syncMode).toBe('default')
    expect(row.sync).toMatchObject({ mode: 'default' })
  })
})

describe('a read whose sync state cannot be read', () => {
  // A failed history read must not fail the connections themselves: admin-api
  // turns a 500 here into an empty connections page.
  let warnings: string[]

  beforeEach(async () => {
    await fastify.close()
    warnings = []
    fastify = Fastify({
      logger: {
        level: 'warn',
        stream: { write: (line: string) => void warnings.push(line) },
      },
    })
    await fastify.register(
      createUnifiedConnectionsRouter({
        store,
        syncState: async () => {
          throw new Error('sync history store down')
        },
      }),
      { prefix: '/admin' },
    )
    await fastify.ready()
  })

  it('the list answers 200 with sync: null on every row, and logs it', async () => {
    await store.create('fortnox', null, { accessToken: 't' }, 'Ledger', 'accounting', 'tenant-a')
    const res = await get('/admin/connections')
    expect(res.statusCode).toBe(200)
    const rows = res.json().data as Array<{ label: string; sync: unknown; status: string }>
    expect(rows).toHaveLength(2)
    for (const row of rows) expect(row).toMatchObject({ sync: null, status: expect.any(String) })
    expect(warnings.join('\n')).toContain('sync history store down')
  })

  it('a single connection answers 200 with sync: null, and logs it', async () => {
    const res = await get(`/admin/connections/${id}`)
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ id, label: 'Books', sync: null })
    expect(warnings.join('\n')).toContain('sync history store down')
  })
})

describe('PUT /admin/connections/:id/sync-schedule', () => {
  it('sets a custom interval', async () => {
    const res = await put({ mode: 'custom', intervalMinutes: 30 })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({
      syncMode: 'custom',
      syncIntervalMinutes: 30,
      sync: { effectiveIntervalMinutes: 30 },
    })
    expect(await store.getRow(id)).toMatchObject({ syncMode: 'custom', syncIntervalMinutes: 30 })
  })

  it('trigger only has no next sync', async () => {
    const res = await put({ mode: 'trigger_only' })
    expect(res.json().data.sync).toMatchObject({ mode: 'trigger_only', nextSyncAt: null })
  })

  it.each([
    [{ mode: 'custom' }],
    [{ mode: 'custom', intervalMinutes: 5 }],
    [{ mode: 'weekly' }],
    [{ mode: 'default', intervalMinutes: 60 }],
    [null],
  ])('refuses %j', async (body) => {
    const res = await put(body)
    expect(res.statusCode).toBe(400)
    expect(res.json().error.code).toBe('INVALID_SYNC_SCHEDULE')
    expect((await store.getRow(id))!.syncMode).toBe('default')
  })

  it('404s an unknown connection', async () => {
    const res = await put({ mode: 'once' }, 'nope')
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('CONNECTION_NOT_FOUND')
  })

  it('needs the admin secret', async () => {
    expect((await put({ mode: 'once' }, id, null)).statusCode).toBe(403)
  })
})

describe('a write whose sync state cannot be read afterwards', () => {
  // The write has committed by the time the state is read, so the reply must
  // not report it as failed (500) or the connection as missing (404).
  async function buildFailing(message: string) {
    await fastify.close()
    fastify = Fastify({ logger: false })
    await fastify.register(
      createUnifiedConnectionsRouter({
        store,
        syncState: async () => {
          throw new Error(message)
        },
      }),
      { prefix: '/admin' },
    )
    await fastify.ready()
  }

  it('a rename still answers 200 with the new label', async () => {
    await buildFailing('sync history not found')
    const res = await fastify.inject({
      method: 'PATCH',
      url: `/admin/connections/${id}`,
      headers: { 'x-admin-secret': ADMIN },
      payload: { label: 'Renamed' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ label: 'Renamed', sync: null })
    expect((await store.getRow(id))!.label).toBe('Renamed')
  })

  it('a schedule change still answers 200', async () => {
    await buildFailing('history store down')
    const res = await put({ mode: 'trigger_only' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data).toMatchObject({ syncMode: 'trigger_only', sync: null })
    expect((await store.getRow(id))!.syncMode).toBe('trigger_only')
  })
})
