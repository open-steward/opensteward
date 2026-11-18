/**
 * The response headers let a developer tell a fresh row from a year-old cache
 * hit — the same hit/miss/live classification the helpers use for their own
 * logs, surfaced to the caller:
 *
 *   X-OpenSteward-Cache:     hit | miss | live | passthrough
 *   X-OpenSteward-Synced-At: ISO write time, on `hit` only
 */
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
  CACHE_SYNCED_AT_HEADER,
} from '../../src/data-store/cached-router-helpers'

function recordingRequest(opts: {
  cacheMode: 'database' | 'passthrough' | 'external'
  resourceStore?: ResourceStore
  query?: Record<string, unknown>
}): { request: FastifyRequest; headers: Record<string, string> } {
  const headers: Record<string, string> = {}
  const request = {
    query: opts.query ?? {},
    vertical: 'accounting',
    platform: 'fortnox',
    connectionId: 'c1',
    cacheMode: opts.cacheMode,
    resourceStore: opts.resourceStore,
    cacheReply: {
      header: (k: string, v: string) => {
        headers[k] = v
      },
    },
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
  return { request, headers }
}

describe('cache-status response headers', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-cache-hdr-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const fetchTwo = async () => [{ id: 'a' }, { id: 'b' }]

  it('miss on the first read, hit with Synced-At on the second', async () => {
    const first = recordingRequest({ cacheMode: 'database', resourceStore: store })
    await cachedList(first.request, { resourceType: 'invoices', fetch: fetchTwo })
    expect(first.headers[CACHE_STATUS_HEADER]).toBe('miss')
    expect(first.headers[CACHE_SYNCED_AT_HEADER]).toBeUndefined()

    const before = Date.now()
    const second = recordingRequest({ cacheMode: 'database', resourceStore: store })
    await cachedList(second.request, { resourceType: 'invoices', fetch: fetchTwo })
    expect(second.headers[CACHE_STATUS_HEADER]).toBe('hit')
    const syncedAt = Date.parse(second.headers[CACHE_SYNCED_AT_HEADER]!)
    expect(syncedAt).toBeGreaterThan(0)
    expect(syncedAt).toBeLessThanOrEqual(before + 1000)
  })

  it('?is_live=true reports live even with a warm cache', async () => {
    const warm = recordingRequest({ cacheMode: 'database', resourceStore: store })
    await cachedList(warm.request, { resourceType: 'invoices', fetch: fetchTwo })

    const live = recordingRequest({
      cacheMode: 'database',
      resourceStore: store,
      query: { is_live: 'true' },
    })
    await cachedList(live.request, { resourceType: 'invoices', fetch: fetchTwo })
    expect(live.headers[CACHE_STATUS_HEADER]).toBe('live')
    expect(live.headers[CACHE_SYNCED_AT_HEADER]).toBeUndefined()
  })

  it('passthrough deployments say so', async () => {
    const r = recordingRequest({ cacheMode: 'passthrough' })
    await cachedList(r.request, { resourceType: 'invoices', fetch: fetchTwo })
    expect(r.headers[CACHE_STATUS_HEADER]).toBe('passthrough')
  })

  it('single-resource reads behave identically', async () => {
    const one = async () => ({ id: 'a', total: 5 })
    const miss = recordingRequest({ cacheMode: 'database', resourceStore: store })
    await cachedGet(miss.request, { resourceType: 'invoices', resourceId: 'a', fetch: one })
    expect(miss.headers[CACHE_STATUS_HEADER]).toBe('miss')

    const hit = recordingRequest({ cacheMode: 'database', resourceStore: store })
    await cachedGet(hit.request, { resourceType: 'invoices', resourceId: 'a', fetch: one })
    expect(hit.headers[CACHE_STATUS_HEADER]).toBe('hit')
    expect(hit.headers[CACHE_SYNCED_AT_HEADER]).toBeDefined()
  })

  it('a harness without the reply stash just gets no headers', async () => {
    // Router unit tests build bare requests; the helpers must not crash.
    const req = {
      query: {},
      vertical: 'accounting',
      platform: 'fortnox',
      connectionId: 'c1',
      cacheMode: 'database',
      resourceStore: store,
      log: { debug: () => {}, info: () => {} },
    } as unknown as FastifyRequest
    const out = await cachedList(req, { resourceType: 'invoices', fetch: fetchTwo })
    expect(out).toHaveLength(2)
  })
})
