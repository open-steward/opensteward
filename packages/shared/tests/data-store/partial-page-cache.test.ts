import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { cachedList } from '../../src/data-store/cached-router-helpers'

/**
 * A paginated or filtered read must never become the cached answer to an
 * unfiltered one.
 *
 * `cachedList` skips the cache for any query carrying params, fetches
 * upstream, and then wrote whatever came back into the collection cache. The
 * store is keyed only by (vertical, platform, connection, resourceType, id),
 * so it has no way to record that those rows were a PAGE rather than the
 * COLLECTION. The read side then treats "some rows exist" as "all rows exist":
 *
 *     GET /invoices?limit=2        -> miss, fetch 2, write 2
 *     GET /invoices                -> queryless -> HIT -> 2 rows
 *
 * The second call reports 2 of 60 invoices, as a cache hit, with no upstream
 * request and nothing in `meta` to indicate truncation. It persists until the
 * cache is invalidated, and every consumer of that connection sees it. One
 * agent asking a narrow question silently truncates the collection for
 * everyone else.
 *
 * The fix is to write only what is demonstrably the whole collection: the
 * request carried no paging or filter params, AND the caller's `isComplete`
 * callback confirms it. Only the caller can confirm it — it holds the params
 * it sent and any total the adapter reported back, neither of which reaches
 * this helper. Anything else is served upstream and not cached: a colder
 * cache, never a wrong one.
 */

function mockRequest(store: ResourceStore, query: Record<string, unknown>): FastifyRequest {
  return {
    query,
    vertical: 'accounting',
    platform: 'xero',
    connectionId: 'conn-1',
    cacheMode: 'database',
    resourceStore: store,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

describe('partial pages never answer an unfiltered list', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-partial-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const all = Array.from({ length: 60 }, (_, i) => ({ id: `inv-${i}` }))

  it('a limit=2 read does not make the unfiltered list report 2 records', async () => {
    await cachedList(mockRequest(store, { connection_id: 'c', limit: '2' }), {
      resourceType: 'invoices',
      fetch: async () => all.slice(0, 2),
    })

    let upstream = false
    const full = await cachedList(mockRequest(store, { connection_id: 'c' }), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return all
      },
    })

    expect(full).toHaveLength(60)
    expect(upstream).toBe(true)
  })

  it('a page=2 read does not seed the collection either', async () => {
    await cachedList(mockRequest(store, { connection_id: 'c', page: '2' }), {
      resourceType: 'invoices',
      fetch: async () => all.slice(10, 20),
    })
    expect(await store.list('accounting', 'xero', 'conn-1', 'invoices')).toHaveLength(0)
  })

  it('a filtered read does not seed the collection either', async () => {
    await cachedList(mockRequest(store, { connection_id: 'c', search: 'acme' }), {
      resourceType: 'invoices',
      fetch: async () => all.slice(0, 3),
    })
    expect(await store.list('accounting', 'xero', 'conn-1', 'invoices')).toHaveLength(0)
  })

  it('still caches a genuinely complete unfiltered collection', async () => {
    // The read-through cache must keep working for the case it exists to
    // serve, or this "fix" is just a disable switch.
    let calls = 0
    const fetch = async () => {
      calls++
      return all
    }
    await cachedList(mockRequest(store, { connection_id: 'c' }), { resourceType: 'invoices', fetch })
    await cachedList(mockRequest(store, { connection_id: 'c' }), { resourceType: 'invoices', fetch })
    expect(calls).toBe(1)
  })

  it('does not cache an unfiltered read that filled the whole page', async () => {
    // A full page is indistinguishable from "there is more upstream", so it is
    // not evidence of a complete collection. Conservative: a later miss, never
    // a truncated hit. The router supplies `isComplete` because only it knows
    // the page size it asked for and any total the adapter reported.
    const exactlyOnePage = Array.from({ length: 100 }, (_, i) => ({ id: `p-${i}` }))
    await cachedList(mockRequest(store, { connection_id: 'c' }), {
      resourceType: 'invoices',
      isComplete: (rows) => rows.length < 100,
      fetch: async () => exactlyOnePage,
    })
    expect(await store.list('accounting', 'xero', 'conn-1', 'invoices')).toHaveLength(0)
  })

  it('caches a short final page, which the router can prove is the last one', async () => {
    await cachedList(mockRequest(store, { connection_id: 'c' }), {
      resourceType: 'invoices',
      isComplete: (rows) => rows.length < 100,
      fetch: async () => all,
    })
    expect(await store.list('accounting', 'xero', 'conn-1', 'invoices')).toHaveLength(60)
  })

  it('keeps writing back on ?is_live=true, which is a refresh not a filter', async () => {
    await cachedList(mockRequest(store, { connection_id: 'c', is_live: 'true' }), {
      resourceType: 'invoices',
      fetch: async () => all,
    })
    expect(await store.list('accounting', 'xero', 'conn-1', 'invoices')).toHaveLength(60)
  })
})
