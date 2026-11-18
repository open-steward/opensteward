import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { FastifyRequest } from 'fastify'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { cachedList, cachedGet } from '../../src/data-store/cached-router-helpers'

/**
 * Finding 26 — the cache served records normalized by an older build.
 *
 * Records are normalized at write and stored in normalized form, so a deploy
 * that changes a transform does not invalidate anything. Observed live: a
 * contact fetched via `get_*` came back with `billingAddress: {}` and
 * `postedAt: "2026-09-01T00:00:00.000Z"` — the pre-Finding-23 and
 * pre-Finding-12 shapes — five hours after those fixes shipped, while the
 * live `list_*` path returned the corrected shapes for the same record.
 *
 * Two shapes for one entity, simultaneously, with nothing in either response
 * to say which build produced it. Worse than either shape alone: it also means
 * a regression suite exercising only the live path passes while consumers read
 * the old one.
 *
 * There was no TTL either (`DATA_STORE_STALE_AFTER_SECONDS` unset), so "until
 * natural expiry" meant "forever".
 *
 * The fix records WHICH normalizer produced a row and refuses to serve rows
 * produced by a different one. Chosen over flush-on-deploy (a manual step that
 * can be forgotten, and a thundering herd when it is not) and over storing raw
 * payloads (which would defeat `strip-raw-payload`, the control that keeps
 * IBANs and bank account numbers out of this store in the first place).
 */

function mockRequest(store: ResourceStore, version: string, query: Record<string, unknown> = {}): FastifyRequest {
  return {
    query,
    vertical: 'accounting',
    platform: 'xero',
    connectionId: 'conn-1',
    cacheMode: 'database',
    resourceStore: store,
    normalizerVersion: () => version,
    log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
  } as unknown as FastifyRequest
}

describe('a record normalized by a different build is not served', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-normver-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('re-fetches a single record when the normalizer version changed', async () => {
    await cachedGet(mockRequest(store, 'v1'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => ({ id: 'c-1', billingAddress: {} }),
    })

    let refetched = false
    const got = await cachedGet(mockRequest(store, 'v2'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => {
        refetched = true
        return { id: 'c-1' }
      },
    })

    expect(refetched).toBe(true)
    expect(got).toEqual({ id: 'c-1' })
  })

  it('still hits when the version is unchanged', async () => {
    let calls = 0
    const fetch = async () => {
      calls++
      return { id: 'c-1' }
    }
    await cachedGet(mockRequest(store, 'v1'), { resourceType: 'contacts', resourceId: 'c-1', fetch })
    await cachedGet(mockRequest(store, 'v1'), { resourceType: 'contacts', resourceId: 'c-1', fetch })
    expect(calls).toBe(1)
  })

  it('re-fetches a whole collection when the normalizer version changed', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    await cachedList(mockRequest(store, 'v1'), { resourceType: 'invoices', fetch: async () => rows })

    let refetched = false
    await cachedList(mockRequest(store, 'v2'), {
      resourceType: 'invoices',
      fetch: async () => {
        refetched = true
        return rows
      },
    })
    expect(refetched).toBe(true)
  })

  it('serves the collection again once written under the new version', async () => {
    const rows = [{ id: 'a' }, { id: 'b' }]
    await cachedList(mockRequest(store, 'v2'), { resourceType: 'invoices', fetch: async () => rows })
    let calls = 0
    await cachedList(mockRequest(store, 'v2'), {
      resourceType: 'invoices',
      fetch: async () => {
        calls++
        return rows
      },
    })
    expect(calls).toBe(0)
  })

  it('handles a rollback the same way as a roll-forward', async () => {
    // Going back to an older build must also refetch: its normalizer is
    // different from the one that wrote the rows, in the same way.
    await cachedGet(mockRequest(store, 'v2'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => ({ id: 'c-1', shape: 'new' }),
    })
    let refetched = false
    await cachedGet(mockRequest(store, 'v1'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => {
        refetched = true
        return { id: 'c-1', shape: 'old' }
      },
    })
    expect(refetched).toBe(true)
  })

  it('does not accumulate a row per version for the same record', async () => {
    for (const v of ['v1', 'v2', 'v3']) {
      await cachedGet(mockRequest(store, v), {
        resourceType: 'contacts',
        resourceId: 'c-1',
        fetch: async () => ({ id: 'c-1', v }),
      })
    }
    // The write replaces in place rather than inserting a per-version copy —
    // otherwise every deploy would grow the store by a full copy of the cache.
    expect(await store.list('accounting', 'xero', 'conn-1', 'contacts')).toHaveLength(1)
  })

  it('keeps working when no version is supplied at all', async () => {
    // An embedder that never wires this must not lose caching entirely.
    const noVersion = { ...mockRequest(store, 'v1'), normalizerVersion: undefined } as unknown as FastifyRequest
    let calls = 0
    const fetch = async () => {
      calls++
      return { id: 'c-9' }
    }
    await cachedGet(noVersion, { resourceType: 'contacts', resourceId: 'c-9', fetch })
    await cachedGet(noVersion, { resourceType: 'contacts', resourceId: 'c-9', fetch })
    expect(calls).toBe(1)
  })
})

describe('a version mismatch is reported as such, not as a cold cache', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore
  const headers: Record<string, string> = {}

  function req(version: string, query: Record<string, unknown> = {}): FastifyRequest {
    return {
      query,
      vertical: 'accounting',
      platform: 'xero',
      connectionId: 'conn-1',
      cacheMode: 'database',
      resourceStore: store,
      normalizerVersion: () => version,
      cacheReply: { header: (k: string, v: string) => (headers[k] = v) },
      log: { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} },
    } as unknown as FastifyRequest
  }

  beforeEach(async () => {
    for (const k of Object.keys(headers)) delete headers[k]
    dir = mkdtempSync(join(tmpdir(), 'oi-nvreason-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('says `version` when rows exist from a previous build', async () => {
    // A deploy produces a wave of these. Reported as `cold` they are
    // indistinguishable from a cache that stopped working — which is exactly
    // the misreading that took three rounds to resolve for `query`.
    await cachedGet(req('v1'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => ({ id: 'c-1' }),
    })
    await cachedGet(req('v2'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => ({ id: 'c-1' }),
    })
    expect(headers['x-opensteward-cache']).toBe('miss')
    expect(headers['x-opensteward-cache-reason']).toBe('version')
  })

  it('still says `cold` when nothing was ever cached', async () => {
    await cachedGet(req('v1'), {
      resourceType: 'contacts',
      resourceId: 'never-seen',
      fetch: async () => ({ id: 'never-seen' }),
    })
    expect(headers['x-opensteward-cache-reason']).toBe('cold')
  })

  it('says `version` on a list too', async () => {
    await cachedList(req('v1'), { resourceType: 'invoices', fetch: async () => [{ id: 'a' }] })
    await cachedList(req('v2'), { resourceType: 'invoices', fetch: async () => [{ id: 'a' }] })
    expect(headers['x-opensteward-cache-reason']).toBe('version')
  })
})
