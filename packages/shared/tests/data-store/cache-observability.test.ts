import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import {
  cachedList,
  cachedGet,
  CACHE_STATUS_HEADER,
  CACHE_REASON_HEADER,
  CACHE_AGE_HEADER,
} from '../../src/data-store/cached-router-helpers'

/**
 * Finding 19, second half — "either it never populates, or the key is specific
 * enough never to hit; determine which."
 *
 * That question was asked three rounds running, and the client cannot answer
 * it, because `status: "miss"` is the same string whether the cache is
 * disabled, cold, bypassed by a query parameter, or expired. Every probe in
 * those sessions carried `limit`, which bypasses the cache by design — so the
 * misses were correct and looked identical to a broken cache.
 *
 * A status that cannot distinguish four different causes is not observability.
 * The reason travels beside it so the next reader answers this from one
 * response instead of a fourth round of guessing.
 */

const headers: Record<string, string> = {}

function mockRequest(opts: {
  store?: ResourceStore
  query?: Record<string, unknown>
  connectionId?: string
  cacheMode?: 'database' | 'passthrough'
  cacheMaxAgeMs?: number
}): FastifyRequest {
  return {
    query: opts.query ?? {},
    vertical: 'accounting',
    platform: 'xero',
    connectionId: opts.connectionId ?? 'conn-1',
    cacheMode: opts.cacheMode ?? 'database',
    resourceStore: opts.store,
    cacheMaxAgeMs: opts.cacheMaxAgeMs,
    cacheReply: { header: (k: string, v: string) => (headers[k] = v) },
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

describe('a cache miss says why', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    for (const k of Object.keys(headers)) delete headers[k]
    dir = mkdtempSync(join(tmpdir(), 'oi-obs-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('reports `query` when a filter or page bypassed the cache', async () => {
    // THE case that produced ten identical "miss" lines across three rounds.
    await cachedList(mockRequest({ store, query: { connection_id: 'c', limit: '1' } }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('miss')
    expect(headers[CACHE_REASON_HEADER]).toBe('query')
  })

  it('reports `cold` when the collection has simply not been cached yet', async () => {
    await cachedList(mockRequest({ store, query: { connection_id: 'c' } }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('miss')
    expect(headers[CACHE_REASON_HEADER]).toBe('cold')
  })

  it('reports `stale` when rows existed but exceeded the TTL', async () => {
    await cachedList(mockRequest({ store, query: { connection_id: 'c' } }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    await new Promise((r) => setTimeout(r, 25))
    await cachedList(mockRequest({ store, query: { connection_id: 'c' }, cacheMaxAgeMs: 1 }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('miss')
    expect(headers[CACHE_REASON_HEADER]).toBe('stale')
  })

  it('reports `disabled` rather than a bare miss when nothing is cached at all', async () => {
    await cachedList(mockRequest({ cacheMode: 'passthrough', query: {} }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('passthrough')
    expect(headers[CACHE_REASON_HEADER]).toBe('disabled')
  })

  it('reports `live` for an explicit ?is_live=true bypass', async () => {
    await cachedList(mockRequest({ store, query: { is_live: 'true' } }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('live')
    expect(headers[CACHE_REASON_HEADER]).toBe('requested')
  })

  it('carries an age on a hit so staleness is visible, not merely implied', async () => {
    await cachedList(mockRequest({ store, query: {} }), {
      resourceType: 'invoices',
      fetch: async () => [{ id: 'a' }],
    })
    await new Promise((r) => setTimeout(r, 30))
    await cachedList(mockRequest({ store, query: {} }), {
      resourceType: 'invoices',
      fetch: async () => {
        throw new Error('must not be called — this should hit')
      },
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('hit')
    expect(Number(headers[CACHE_AGE_HEADER])).toBeGreaterThanOrEqual(0)
  })

  it('the queryless repeat that the reports never tried does hit', async () => {
    // Stated explicitly because three handovers concluded "the cache never
    // hits" from evidence that only ever exercised the bypass path.
    let calls = 0
    const fetch = async () => {
      calls++
      return [{ id: 'a' }]
    }
    const req = () => mockRequest({ store, query: { connection_id: 'c' } })
    await cachedList(req(), { resourceType: 'invoices', fetch })
    await cachedList(req(), { resourceType: 'invoices', fetch })
    expect(calls).toBe(1)
    expect(headers[CACHE_STATUS_HEADER]).toBe('hit')
  })

  it('reports reasons on single-record reads too', async () => {
    await cachedGet(mockRequest({ store, query: {} }), {
      resourceType: 'invoices',
      resourceId: 'i-1',
      fetch: async () => ({ id: 'i-1' }),
    })
    expect(headers[CACHE_REASON_HEADER]).toBe('cold')
    await cachedGet(mockRequest({ store, query: {} }), {
      resourceType: 'invoices',
      resourceId: 'i-1',
      fetch: async () => ({ id: 'i-1' }),
    })
    expect(headers[CACHE_STATUS_HEADER]).toBe('hit')
  })
})
