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
  writeThrough,
  cachedDelete,
  isLive,
} from '../../src/data-store/cached-router-helpers'

function mockRequest(opts: {
  vertical?: string
  platform?: string
  connectionId?: string
  cacheMode?: 'database' | 'passthrough' | 'external'
  resourceStore?: ResourceStore
  query?: Record<string, unknown>
  cacheMaxAgeMs?: number
}): FastifyRequest {
  return {
    query: opts.query ?? {},
    vertical: opts.vertical,
    platform: opts.platform,
    connectionId: opts.connectionId,
    cacheMode: opts.cacheMode,
    resourceStore: opts.resourceStore,
    cacheMaxAgeMs: opts.cacheMaxAgeMs,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

describe('cached-router-helpers', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-crh-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })

  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('isLive parses the query flag', () => {
    expect(isLive({ is_live: 'true' })).toBe(true)
    expect(isLive({ is_live: '1' })).toBe(true)
    expect(isLive({ live: 'true' })).toBe(true)
    expect(isLive({})).toBe(false)
    expect(isLive({ is_live: 'false' })).toBe(false)
  })

  it('passthrough mode skips the cache entirely', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return [{ id: 'a' }, { id: 'b' }]
    }
    const req = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'passthrough',
      resourceStore: store,
    })
    const r1 = await cachedList<{ id: string }>(req, { resourceType: 'invoices', fetch: fetcher })
    const r2 = await cachedList<{ id: string }>(req, { resourceType: 'invoices', fetch: fetcher })
    expect(r1).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(r2).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(calls).toBe(2)
    expect(await store.count()).toBe(0)
  })

  it('database mode caches list results and serves from cache on second call', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return [{ id: 'a' }, { id: 'b' }]
    }
    const req = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await cachedList<{ id: string }>(req, { resourceType: 'invoices', fetch: fetcher })
    await cachedList<{ id: string }>(req, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(1)
  })

  it('?is_live=true bypasses read but writes back to cache', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return [{ id: 'fresh' }]
    }
    const req1 = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await cachedList<{ id: string }>(req1, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(1)
    const req2 = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
      query: { is_live: 'true' },
    })
    await cachedList<{ id: string }>(req2, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(2)
    expect((await store.list('accounting', 'fortnox', 'c1', 'invoices')).length).toBe(1)
  })

  it('cachedGet hits cache on second call', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return { id: 'inv-1', amount: 100 }
    }
    const req = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await cachedGet(req, { resourceType: 'invoices', resourceId: 'inv-1', fetch: fetcher })
    await cachedGet(req, { resourceType: 'invoices', resourceId: 'inv-1', fetch: fetcher })
    expect(calls).toBe(1)
  })

  it('writeThrough updates cache for subsequent reads', async () => {
    const req = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await writeThrough(req, {
      resourceType: 'invoices',
      resourceId: 'new-1',
      data: { id: 'new-1', amount: 50 },
    })
    expect(await store.get('accounting', 'fortnox', 'c1', 'invoices', 'new-1')).toEqual({
      id: 'new-1',
      amount: 50,
    })
  })

  it('cachedDelete drops the cache row', async () => {
    const req = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await writeThrough(req, { resourceType: 'invoices', resourceId: 'x', data: { id: 'x' } })
    await cachedDelete(req, { resourceType: 'invoices', resourceId: 'x' })
    expect(await store.get('accounting', 'fortnox', 'c1', 'invoices', 'x')).toBeNull()
  })

  it('falls through to passthrough when request decoration is missing', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return [{ id: 'a' }]
    }
    // No vertical/platform/connectionId — should not crash, should hit fetcher.
    const req = mockRequest({ cacheMode: 'database', resourceStore: store })
    await cachedList<{ id: string }>(req, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(1)
    expect(await store.count()).toBe(0)
  })

  it('respects cacheMaxAgeMs — stale rows treated as miss', async () => {
    let calls = 0
    const fetcher = async () => {
      calls++
      return [{ id: 'a' }]
    }
    const req1 = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await cachedList<{ id: string }>(req1, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(1)
    // Backdate the cache row.
    await handle.kysely
      .updateTable('resources')
      .set({ updated_at: Date.now() - 10 * 60_000 })
      .where('resource_id', '=', 'a')
      .execute()

    // Without TTL, hits cache.
    const req2 = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
    })
    await cachedList<{ id: string }>(req2, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(1)

    // With a tight TTL, stale → miss → re-fetch.
    const req3 = mockRequest({
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
      cacheMaxAgeMs: 60_000,
    })
    await cachedList<{ id: string }>(req3, { resourceType: 'invoices', fetch: fetcher })
    expect(calls).toBe(2)
  })
})
