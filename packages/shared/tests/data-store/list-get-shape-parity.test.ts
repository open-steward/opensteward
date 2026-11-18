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
 * The seventh generic test, requested in Handover 6: the same record must have
 * the same shape whether it arrives via `list_*` or `get_*`.
 *
 * This is the assertion that would have caught Finding 26 on the day it
 * shipped. A contact came back from `list_*` with its addresses correctly
 * omitted and from `get_*` with `billingAddress: {}` — two schemas for one
 * entity, live simultaneously, because `list_*` was uncached and `get_*` was
 * not. Every "verified fixed" in Handovers 1–5 confirmed via a list call
 * carried that caveat silently.
 *
 * The property is deliberately about the CACHE rather than the transforms:
 * both paths call the same transform, so they can only diverge through what
 * the cache does to a record on the way in and out. That is exactly where the
 * divergence was.
 */

const NORM = 'norm-abc'

function request(store: ResourceStore, version = NORM, query: Record<string, unknown> = {}): FastifyRequest {
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

/** A record shaped like the one that exposed the divergence. */
const CONTACT = {
  id: 'c-1',
  name: 'Luna Cafe',
  isCustomer: false,
  isActive: true,
  postedAt: '2026-09-01',
}

describe('list and get agree on a record’s shape', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-parity-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    store = await ResourceStore.create(handle)
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('agree when both come from upstream', async () => {
    const fromList = (
      await cachedList(request(store), { resourceType: 'contacts', fetch: async () => [CONTACT] })
    )[0]
    const fromGet = await cachedGet(request(store, NORM, { is_live: 'true' }), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => CONTACT,
    })
    expect(Object.keys(fromGet!).sort()).toEqual(Object.keys(fromList!).sort())
    expect(fromGet).toEqual(fromList)
  })

  it('agree when get is served from cache and list is not', async () => {
    // The exact configuration that produced two shapes: `get_*` hitting the
    // cache while `list_*` (carrying a param) went upstream.
    await cachedGet(request(store), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => CONTACT,
    })
    const cachedRecord = await cachedGet(request(store), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => {
        throw new Error('should have hit the cache')
      },
    })
    const liveRecord = (
      await cachedList(request(store, NORM, { limit: '1' }), {
        resourceType: 'contacts',
        fetch: async () => [CONTACT],
      })
    )[0]

    expect(Object.keys(cachedRecord!).sort()).toEqual(Object.keys(liveRecord!).sort())
    expect(cachedRecord).toEqual(liveRecord)
  })

  it('never serves a cached record whose shape predates the current normalizer', async () => {
    // Write the OLD shape under the old version, then read under the new one.
    const oldShape = { id: 'c-1', name: 'Luna Cafe', billingAddress: {}, postedAt: '2026-09-01T00:00:00.000Z' }
    await cachedGet(request(store, 'norm-old'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => oldShape,
    })

    const now = await cachedGet(request(store, NORM), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => CONTACT,
    })
    expect(now).toEqual(CONTACT)
    expect(now).not.toHaveProperty('billingAddress')
  })

  it('agrees after a normalizer change, on both paths', async () => {
    await cachedGet(request(store, 'norm-old'), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => ({ id: 'c-1', billingAddress: {} }),
    })
    await cachedList(request(store, 'norm-old'), {
      resourceType: 'contacts',
      fetch: async () => [{ id: 'c-1', billingAddress: {} }],
    })

    const fromGet = await cachedGet(request(store, NORM), {
      resourceType: 'contacts',
      resourceId: 'c-1',
      fetch: async () => CONTACT,
    })
    const fromList = (
      await cachedList(request(store, NORM), { resourceType: 'contacts', fetch: async () => [CONTACT] })
    )[0]

    expect(fromGet).toEqual(fromList)
    expect(fromGet).toEqual(CONTACT)
  })
})
