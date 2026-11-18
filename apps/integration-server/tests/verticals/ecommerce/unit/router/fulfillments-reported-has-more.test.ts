/**
 * A list page the adapter says is not the last is never cached as the whole
 * collection, however short it is.
 *
 * otto-market's shipments endpoint serves at most 25 rows, declares no
 * `maxPageSize` (its families' ceilings disagree), and reports `hasMore` from
 * the upstream's `rel: "next"` link. Against the router's default limit of 100
 * those 25 rows are a short page by length alone. `listPage` deferred to the
 * adapter and answered `hasMore: true`, but `collectionIsComplete` judged by
 * length only, so `cachedList` marked the collection complete in the same
 * request. The next unfiltered read was a cache hit that served the 25 rows as
 * the whole collection, now with `hasMore: false`.
 *
 * Driven through the REAL ecommerce fulfillments router, the real `cachedList`
 * and a real SQLite resource store in database mode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import {
  openDb,
  pageOffset,
  reportUpstreamPage,
  ResourceStore,
  type DbHandle,
  type QueryParams,
} from '@opensteward/shared'
import { createFulfillmentsRouter } from '../../../../../src/verticals/ecommerce/router/fulfillments'

const UPSTREAM_PAGE = 25
const UPSTREAM = Array.from({ length: 120 }, (_, i) => ({
  id: `shp_${i + 1}`,
  orderId: `ord_${i + 1}`,
  status: 'shipped',
}))
const CONNECTION_ID = '00000000-0000-4000-8000-000000000002'

/** Like otto-market's listFulfillments: 25 at most, `hasMore` from rel:next. */
function makeAdapter() {
  const calls: QueryParams[] = []
  const adapter = {
    platform: 'otto-market',
    version: '0.0.0-test',
    listFulfillments: async (_creds: unknown, params: QueryParams) => {
      calls.push({ ...params })
      const size = Math.min(params.limit ?? UPSTREAM_PAGE, UPSTREAM_PAGE)
      const start = pageOffset(params, size)
      reportUpstreamPage(params, { hasMore: start + size < UPSTREAM.length })
      return UPSTREAM.slice(start, start + size)
    },
  }
  return { adapter, calls }
}

describe('ecommerce fulfillments router over an adapter that reports hasMore on a short page', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore
  let fastify: FastifyInstance
  let calls: QueryParams[]

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-reported-more-'))
    handle = await openDb({ sqlitePath: join(dir, 'resources.db') })
    store = await ResourceStore.create(handle)
    const fake = makeAdapter()
    calls = fake.calls
    fastify = Fastify({ logger: false })
    fastify.addHook('preHandler', async (request, reply) => {
      Object.assign(request, {
        adapter: fake.adapter,
        credentials: { accessToken: 'test' },
        vertical: 'ecommerce',
        platform: 'otto-market',
        connectionId: CONNECTION_ID,
        cacheMode: 'database',
        resourceStore: store,
        cacheReply: reply,
      })
    })
    await fastify.register(createFulfillmentsRouter(), { prefix: '/v1' })
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('answers the short page with the adapter’s hasMore: true', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/fulfillments' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data).toHaveLength(25)
    expect(body.meta.limit).toBe(100)
    expect(body.meta.hasMore).toBe(true)
  })

  it('does not mark that page as the complete cached collection', async () => {
    await fastify.inject({ method: 'GET', url: '/v1/fulfillments' })
    expect(
      await store.collectionCompletedAt('ecommerce', 'otto-market', CONNECTION_ID, 'fulfillments'),
    ).toBeNull()

    const again = await fastify.inject({ method: 'GET', url: '/v1/fulfillments' })
    expect(again.headers['x-opensteward-cache']).toBe('miss')
    expect(again.json().meta.hasMore).toBe(true)
    expect(calls).toHaveLength(2)
  })

  it('still says there is no more on the last page', async () => {
    const res = await fastify.inject({ method: 'GET', url: '/v1/fulfillments?page=5' })
    const body = res.json()
    expect(body.data.map((f: { id: string }) => f.id)).toEqual(
      UPSTREAM.slice(100, 120).map((f) => f.id),
    )
    expect(body.meta.hasMore).toBe(false)
  })
})
