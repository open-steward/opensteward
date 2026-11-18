/**
 * A list route asks its adapter for no more than the platform will serve.
 *
 * Paysafe's page maximum is 50 and the router's default limit is 100. The
 * router used to ask for 100, the adapter clamped to 50, and the router then
 * judged 50 rows against 100: a short page, so `meta.hasMore: false`, and
 * `collectionIsComplete` true, so the cache stored those 50 rows as the whole
 * collection and served them as such from then on. The adapter declares its
 * maximum in `capabilities.maxPageSize`; the sync worker honoured it, the
 * router did not.
 *
 * Driven through the REAL payments plans router with a fake adapter, and
 * through the real `cachedList` over a real SQLite resource store, so both the
 * envelope and the cache's completeness decision are what production runs.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  openDb,
  pageOffset,
  ResourceStore,
  type DbHandle,
  type QueryParams,
} from '@opensteward/shared'
import { createPlansRouter } from '../../../../../src/verticals/payments/router/plans'

const MAX_PAGE_SIZE = 50
const UPSTREAM = Array.from({ length: 120 }, (_, i) => ({
  id: `plan_${i + 1}`,
  name: `Plan ${i + 1}`,
}))
const CONNECTION_ID = '00000000-0000-4000-8000-000000000001'

/** Like paysafe: never sends more than its maximum, reports no total. */
function makeAdapter() {
  const calls: QueryParams[] = []
  const adapter = {
    platform: 'paysafe',
    version: '0.0.0-test',
    capabilities: { maxPageSize: MAX_PAGE_SIZE },
    listPlans: async (_creds: unknown, params: QueryParams) => {
      calls.push({ ...params })
      const size = Math.min(params.limit ?? 100, MAX_PAGE_SIZE)
      const start = pageOffset(params, size)
      return UPSTREAM.slice(start, start + size)
    },
  }
  return { adapter, calls }
}

describe('payments plans router over an adapter with a 50-row page maximum', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore
  let fastify: FastifyInstance
  let calls: QueryParams[]

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-page-max-'))
    handle = await openDb({ sqlitePath: join(dir, 'resources.db') })
    store = await ResourceStore.create(handle)
    const fake = makeAdapter()
    calls = fake.calls
    fastify = Fastify({ logger: false })
    // What the auth middleware and attachDataStoreContext decorate in
    // production: the adapter, its credentials, and a database-mode cache.
    fastify.addHook('preHandler', async (request, reply) => {
      Object.assign(request, {
        adapter: fake.adapter,
        credentials: { accessToken: 'test' },
        vertical: 'payments',
        platform: 'paysafe',
        connectionId: CONNECTION_ID,
        cacheMode: 'database',
        resourceStore: store,
        cacheReply: reply,
      })
    })
    await fastify.register(createPlansRouter(), { prefix: '/v1' })
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('serves 50 rows with meta.limit 50 and does not call the page the last', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/plans' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(50)
    expect(body.meta.limit).toBe(50)
    expect(body.meta.hasMore).not.toBe(false)
    expect(body.meta.hasMore).toBeNull()
    expect(calls[0]?.limit).toBe(50)
  })

  it('does not mark a full clamped page as the complete cached collection', async () => {
    await fastify.inject({ method: 'GET', url: '/v1/plans' })
    expect(
      await store.collectionCompletedAt('payments', 'paysafe', CONNECTION_ID, 'plans'),
    ).toBeNull()

    // A second unfiltered read goes upstream again rather than serving the
    // first 50 rows from the cache as all of them.
    const again = await fastify.inject({ method: 'GET', url: '/v1/plans' })
    expect(again.headers['x-opensteward-cache']).toBe('miss')
    expect(again.json().data).toHaveLength(50)
    expect(calls).toHaveLength(2)
  })

  it('pages past page 1 at the served limit, reaching every row once', async () => {
    const served: string[] = []
    const metas: Array<{ page: number; limit: number; hasMore: boolean | null }> = []
    for (let page = 1; page <= 5; page++) {
      const res = await fastify.inject({ method: 'GET', url: `/v1/plans?page=${page}` })
      const body = res.json()
      served.push(...body.data.map((p: { id: string }) => p.id))
      metas.push({ page: body.meta.page, limit: body.meta.limit, hasMore: body.meta.hasMore })
      if (body.meta.hasMore === false) break
    }
    expect(served).toEqual(UPSTREAM.map((p) => p.id))
    expect(metas).toEqual([
      { page: 1, limit: 50, hasMore: null },
      { page: 2, limit: 50, hasMore: null },
      { page: 3, limit: 50, hasMore: false },
    ])
  })

  it('reads page=0 as the first page', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/plans?page=0&limit=10' })
    const body = res.json()
    expect(body.meta.page).toBe(1)
    expect(body.data.map((p: { id: string }) => p.id)).toEqual(
      UPSTREAM.slice(0, 10).map((p) => p.id),
    )
  })
})
