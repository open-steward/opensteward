/**
 * `GET /v1/{vertical}/sync` gains NOTHING from the store's new paging, sorting
 * and per-column filtering.
 *
 * `createSyncRouter` is mounted in all nine verticals, so this is the public,
 * Bearer-key surface and every query param it accepts lands in the generated
 * OpenAPI spec, the SDK and the Postman collection. `SyncStore.list` grew
 * `offset`, `sort`, `dir`, `tenantId`, `idContains` and `connectionIdContains`
 * for the ADMIN table; widening the public route to match would expand that
 * spec for something nobody asked for.
 *
 * The assertion that carries this file is the exact-object one: the router
 * must call the store with exactly the four keys it always did, even when the
 * URL carries every new param at once. `expect.objectContaining` would pass
 * against a router that forwarded all of them.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { createSyncRouter } from '../../src/data-store/sync-router'
import { SyncStore } from '../../src/data-store/sync-store'
import { buildSyncOpenapiPaths } from '../../src/data-store/sync-openapi'

let app: FastifyInstance
const list = vi.fn(async () => [])

/** Boot the router with a request decorated the way the auth middleware does. */
async function build(store: unknown): Promise<FastifyInstance> {
  app = Fastify({ logger: false })
  app.addHook('preHandler', async (request) => {
    const r = request as unknown as Record<string, unknown>
    r.connectionId = 'conn_1'
    r.platform = 'fortnox'
    r.tenantId = 'tenant-a'
  })
  await app.register(
    createSyncRouter({ vertical: 'accounting', syncStore: store as unknown as SyncStore }),
  )
  await app.ready()
  return app
}

beforeEach(() => {
  list.mockClear()
})

afterEach(async () => {
  await app?.close()
})

describe('GET /sync keeps exactly the query surface it had', () => {
  it('calls the store with only vertical, connectionId, status and limit', async () => {
    const instance = await build({ list })
    const res = await instance.inject({ method: 'GET', url: '/sync' })
    expect(res.statusCode).toBe(200)
    expect(list).toHaveBeenCalledWith({
      vertical: 'accounting',
      connectionId: 'conn_1',
      status: undefined,
      limit: 25,
    })
  })

  /**
   * The whole point of this file. Every param the ADMIN route gained is
   * present in this URL; none of them may reach the store. Exact equality, not
   * `objectContaining` — the failure mode being guarded is an EXTRA key, which
   * `objectContaining` cannot see.
   */
  it('ignores every param the admin surface gained, rather than forwarding it', async () => {
    const instance = await build({ list })
    const res = await instance.inject({
      method: 'GET',
      url: '/sync?offset=50&page=3&sort=status&dir=desc&platform=shopify&tenant_id=acme&id=j-1&connection_id_contains=conn',
    })
    expect(res.statusCode).toBe(200)
    expect(list).toHaveBeenCalledWith({
      vertical: 'accounting',
      connectionId: 'conn_1',
      status: undefined,
      limit: 25,
    })
  })

  it('keeps its 25 default and its 100 cap', async () => {
    const instance = await build({ list })
    await instance.inject({ method: 'GET', url: '/sync?limit=10' })
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 10 }))
    await instance.inject({ method: 'GET', url: '/sync?limit=500' })
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 100 }))
    await instance.inject({ method: 'GET', url: '/sync?status=failed' })
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'failed', limit: 25 }))
    // An EMPTY `?limit=` is an omitted limit, not a bad one: it is falsy, so
    // it has always taken the default branch. Asserted here rather than
    // alongside the bad-value cases above, where it could not fail.
    await instance.inject({ method: 'GET', url: '/sync?limit=' })
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25 }))
  })

  /**
   * A bad `limit` collapses to THIS route's default, not the store's.
   *
   * `parseInt('abc')` is `NaN` and `Math.min(NaN, 100)` is `NaN`, which the
   * store's `Number.isInteger` clamp then replaced with ITS OWN default of 50
   * — so `?limit=abc` returned 50 rows where an omitted `limit` returns 25.
   * Nothing was unsafe (both are under the 100 cap) but the two defaults
   * disagreed, against Part A's stated rule that a bad value collapses to the
   * same default the parameter would get if omitted.
   *
   * Asserting 25 rather than "some default" is the point: 50 is what the
   * broken path returns, and it is equally a default.
   */
  it.each([
    ['a non-numeric limit', '?limit=abc'],
    ['a zero limit', '?limit=0'],
    ['a negative limit', '?limit=-5'],
    // `?limit=` is deliberately NOT in this list. An empty string is falsy, so
    // the PRE-FIX expression already took the `: 25` branch for it — the
    // store's 50 was never reachable through that input, and the row passed
    // under the revert while its three neighbours failed. An empty limit is an
    // OMITTED limit, not a bad one; it belongs in the default test below and
    // is asserted there.
  ])('collapses %s to the route own 25 default, not the store 50', async (_label, query) => {
    const instance = await build({ list })
    const res = await instance.inject({ method: 'GET', url: `/sync${query}` })
    expect(res.statusCode).toBe(200)
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 25 }))
  })

  it('documents exactly three query params beside the required connection_id', () => {
    const paths = buildSyncOpenapiPaths({
      vertical: 'accounting',
      prefix: '/v1/accounting',
      tag: 'Sync',
    })
    const entry = Object.entries(paths).find(([p]) => p.endsWith('/sync'))
    const get = (entry?.[1] as { get?: { parameters?: Array<{ in: string; name: string }> } })?.get
    const names = (get?.parameters ?? []).filter((p) => p.in === 'query').map((p) => p.name)
    expect(names).toEqual(['connection_id', 'status', 'limit'])
  })
})

describe('GET /sync still scopes a caller to their own connection', () => {
  let handle: DbHandle

  afterEach(async () => {
    await handle?.close()
  })

  /**
   * The ownership guard, end to end. `SyncListFilter.connectionId` stayed an
   * EXACT match while a separate `connectionIdContains` was added for the
   * admin table — merging the two would make this return the other tenant's
   * job.
   */
  it('does not return a job whose connection id merely contains the caller’s', async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    const store = await SyncStore.create(handle)
    await handle.kysely
      .insertInto('sync_jobs')
      .values([
        {
          id: 'j-own',
          vertical: 'accounting',
          connection_id: 'conn_1',
          platform: 'fortnox',
          tenant_id: null,
          status: 'pending',
          progress: null,
          error: null,
          callback_url: null,
          created_at: 100,
        },
        {
          id: 'j-other',
          vertical: 'accounting',
          connection_id: 'conn_1-extended',
          platform: 'fortnox',
          tenant_id: null,
          status: 'pending',
          progress: null,
          error: null,
          callback_url: null,
          created_at: 200,
        },
      ])
      .execute()
    const instance = await build(store)
    const res = await instance.inject({ method: 'GET', url: '/sync' })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.map((j: { id: string }) => j.id)).toEqual(['j-own'])
  })
})
