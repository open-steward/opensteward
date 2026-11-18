import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { cachedList, cachedGet, writeThrough, cachedDelete } from '../../src/data-store/cached-router-helpers'

/**
 * A cached collection is only complete if something wrote the WHOLE
 * collection. Rows existing is not that.
 *
 * The previous fix guarded `cachedList`'s writes so a filtered page could not
 * become the cached collection. It missed that `cachedGet` writes into the
 * same table: one `get_invoices(id=…)` stores a single row, and the queryless
 * list path then saw `rows.length > 0` and served that one invoice as the
 * entire collection — a cache HIT, no upstream call, `hasMore: false`.
 *
 * Observed live against the deployed build, after the store had been flushed:
 *
 *     GET /v1/me/accounting/invoices   ->  hit, 1 record of 32
 *     store: xero invoices = 1 rows, xero contacts = 1 rows
 *
 * So completeness is now recorded explicitly rather than inferred from row
 * count. Only a write that can prove it wrote the whole collection sets the
 * marker; single-record writes never do, and any mutation clears it.
 */

function mockRequest(store: ResourceStore, query: Record<string, unknown> = {}): FastifyRequest {
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

describe('row presence is not collection completeness', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-complete-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const all = Array.from({ length: 32 }, (_, i) => ({ id: `inv-${i}` }))

  it('a single get does not make the unfiltered list report one record', async () => {
    // THE live defect.
    await cachedGet(mockRequest(store), {
      resourceType: 'invoices',
      resourceId: 'inv-7',
      fetch: async () => ({ id: 'inv-7' }),
    })

    let upstream = false
    const rows = await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return all
      },
    })

    expect(upstream).toBe(true)
    expect(rows).toHaveLength(32)
  })

  it('serves the collection from cache once a complete list has been written', async () => {
    let calls = 0
    const fetch = async () => {
      calls++
      return all
    }
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch })
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch })
    expect(calls).toBe(1)
  })

  it('a filtered page still does not seed the collection', async () => {
    await cachedList(mockRequest(store, { limit: '2' }), {
      resourceType: 'invoices',
      fetch: async () => all.slice(0, 2),
    })
    let upstream = false
    const rows = await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return all
      },
    })
    expect(upstream).toBe(true)
    expect(rows).toHaveLength(32)
  })

  it('a create invalidates the completed collection', async () => {
    // The cached collection is now missing a row, so serving it would omit the
    // record the caller just made.
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: async () => all })
    await writeThrough(mockRequest(store), {
      resourceType: 'invoices',
      resourceId: 'inv-new',
      data: { id: 'inv-new' },
    })

    let upstream = false
    await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return [...all, { id: 'inv-new' }]
      },
    })
    expect(upstream).toBe(true)
  })

  it('a delete invalidates the completed collection', async () => {
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: async () => all })
    await cachedDelete(mockRequest(store), { resourceType: 'invoices', resourceId: 'inv-1' })

    let upstream = false
    await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return all.slice(1)
      },
    })
    expect(upstream).toBe(true)
  })

  it('completeness is scoped per resource type', async () => {
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: async () => all })
    let upstream = false
    await cachedList(mockRequest(store), {
      resourceType: 'contacts',
      fetch: async () => {
        upstream = true
        return [{ id: 'c-1' }]
      },
    })
    expect(upstream).toBe(true)
  })

  it('completeness is scoped per connection', async () => {
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: async () => all })
    const other = {
      ...mockRequest(store),
      connectionId: 'conn-2',
    } as unknown as FastifyRequest
    let upstream = false
    await cachedList(other, {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return [{ id: 'x' }]
      },
    })
    expect(upstream).toBe(true)
  })

  it('an empty upstream answer does not vouch for rows a get cached', async () => {
    // A marker over an empty cache buys nothing — a hit needs at least one row
    // — so its only effect is when rows ARE cached: it then serves them as the
    // whole collection although upstream just said there are none (or, from an
    // adapter that turns a 403 into `[]`, that it will not say).
    await cachedGet(mockRequest(store), {
      resourceType: 'invoices',
      resourceId: 'inv-7',
      fetch: async () => ({ id: 'inv-7' }),
    })
    const empty = async () => [] as Array<{ id: string }>
    expect(
      await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: empty }),
    ).toEqual([])

    let upstream = false
    const rows = await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return []
      },
    })
    expect(upstream).toBe(true)
    expect(rows).toEqual([])
  })

  it('an empty upstream answer drops a marker a refresh finds standing', async () => {
    // `is_live` refreshes a vouched collection; upstream now has nothing.
    await cachedList(mockRequest(store), { resourceType: 'invoices', fetch: async () => all })
    await cachedList(mockRequest(store, { is_live: 'true' }), {
      resourceType: 'invoices',
      fetch: async () => [],
    })

    let upstream = false
    await cachedList(mockRequest(store), {
      resourceType: 'invoices',
      fetch: async () => {
        upstream = true
        return []
      },
    })
    expect(upstream).toBe(true)
  })

  it('single-record reads still cache and hit on their own key', async () => {
    // The marker must not disable get-by-id caching, which is the thing
    // `cachedGet` exists for.
    let calls = 0
    const fetch = async () => {
      calls++
      return { id: 'inv-7' }
    }
    await cachedGet(mockRequest(store), { resourceType: 'invoices', resourceId: 'inv-7', fetch })
    await cachedGet(mockRequest(store), { resourceType: 'invoices', resourceId: 'inv-7', fetch })
    expect(calls).toBe(1)
  })
})
