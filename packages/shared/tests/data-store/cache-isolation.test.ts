import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify from 'fastify'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { cachedList, cachedGet } from '../../src/data-store/cached-router-helpers'

/**
 * Finding 19 — the two properties a client cannot observe from a response.
 *
 * Finding 14 (cross-tenant isolation) passes at the HTTP layer, but that test
 * cannot see whether the cache would undo it. A cache hit typically
 * short-circuits early, so if a lookup ran BEFORE the ownership check, or if
 * the key were not scoped per connection, the isolation would be bypassed
 * silently and Finding 14 would still pass.
 *
 * Both are asserted here rather than by inspection, because "I read the code
 * and the hook order looked right" is exactly the kind of claim that rots the
 * first time a hook is reordered.
 */

function mockRequest(opts: {
  store?: ResourceStore
  connectionId?: string
  platform?: string
  query?: Record<string, unknown>
}): FastifyRequest {
  return {
    query: opts.query ?? {},
    vertical: 'accounting',
    platform: opts.platform ?? 'xero',
    connectionId: opts.connectionId,
    cacheMode: 'database',
    resourceStore: opts.store,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

const A = 'aaaaaaaa-0000-4000-8000-000000000001'
const B = 'bbbbbbbb-0000-4000-8000-000000000002'

describe('cache key scoping', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-iso-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('never serves connection A’s rows to connection B', async () => {
    await cachedList(mockRequest({ store, connectionId: A }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'A-secret-1' }, { id: 'A-secret-2' }],
    })

    let bFetched = false
    const rows = await cachedList(mockRequest({ store, connectionId: B }), {
      resourceType: 'invoices',
      fetch: async () => {
        bFetched = true
        return [{ id: 'B-own-1' }]
      },
    })

    expect(bFetched).toBe(true) // B must miss, not inherit A's entry
    expect(rows.map((r) => r.id)).toEqual(['B-own-1'])
    expect(JSON.stringify(rows)).not.toContain('A-secret')
  })

  it('never serves a single record across connections either', async () => {
    await cachedGet(mockRequest({ store, connectionId: A }), {
      resourceType: 'invoices',
      resourceId: 'shared-id',
      fetch: async () => ({ id: 'shared-id', note: 'A-secret' }),
    })

    const got = await cachedGet(mockRequest({ store, connectionId: B }), {
      resourceType: 'invoices',
      resourceId: 'shared-id',
      fetch: async () => ({ id: 'shared-id', note: 'B-own' }),
    })

    // Same resource id on both sides — only the connection separates them.
    expect((got as { note: string }).note).toBe('B-own')
  })

  it('separates the same connection id across platforms', async () => {
    await cachedList(mockRequest({ store, connectionId: A, platform: 'xero' }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'xero-1' }],
    })
    const rows = await cachedList(mockRequest({ store, connectionId: A, platform: 'fortnox' }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'fortnox-1' }],
    })
    expect(rows.map((r) => r.id)).toEqual(['fortnox-1'])
  })
})

describe('authorization runs before the cache is consulted', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-iso2-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('a request refused by the ownership hook never reads the store', async () => {
    // Warm the cache for connection A so there IS something to leak.
    await cachedList(mockRequest({ store, connectionId: A }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'A-secret-1' }],
    })

    const listSpy = vi.spyOn(store, 'listWithMeta')

    const app = Fastify({ logger: false })
    // Stands in for the real end-user middleware: a preHandler that refuses
    // before any route handler runs. The property under test is the ORDERING,
    // which is a property of the hook pipeline, not of any one middleware.
    app.addHook('preHandler', async (request, reply) => {
      const q = request.query as { connection_id?: string }
      if (q.connection_id !== B) {
        await reply.status(403).send({
          error: { code: 'CONNECTION_FORBIDDEN', message: 'not linked to your end-user record' },
        })
        return reply
      }
      ;(request as unknown as Record<string, unknown>)['vertical'] = 'accounting'
      ;(request as unknown as Record<string, unknown>)['platform'] = 'xero'
      ;(request as unknown as Record<string, unknown>)['connectionId'] = q.connection_id
      ;(request as unknown as Record<string, unknown>)['cacheMode'] = 'database'
      ;(request as unknown as Record<string, unknown>)['resourceStore'] = store
      return undefined
    })
    app.get('/invoices', async (request) =>
      cachedList(request, { resourceType: 'invoices', fetch: async () => [{ id: 'fresh' }] }),
    )
    await app.ready()

    const res = await app.inject({ method: 'GET', url: `/invoices?connection_id=${A}` })

    expect(res.statusCode).toBe(403)
    expect(res.payload).not.toContain('A-secret')
    // The point: not merely "no leak in the body" but "the cache was never
    // even consulted". A hit that short-circuits ahead of authz is the leak.
    expect(listSpy).not.toHaveBeenCalled()

    await app.close()
  })

  it('falls back to passthrough rather than guessing when auth context is missing', async () => {
    // If a route is ever mounted without the auth middleware, the helper must
    // not invent a cache scope — an undefined connection must never collide
    // with a real one.
    const listSpy = vi.spyOn(store, 'listWithMeta')
    const rows = await cachedList(mockRequest({ store, connectionId: undefined }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'live' }],
    })
    expect(rows.map((r) => r.id)).toEqual(['live'])
    expect(listSpy).not.toHaveBeenCalled()
  })
})
