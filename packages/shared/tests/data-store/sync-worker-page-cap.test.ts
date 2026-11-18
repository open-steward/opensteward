import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'
import { SyncWorker, type TokenRefresherLike } from '../../src/data-store/sync-worker'
import { CircuitBreaker } from '../../src/circuit-breaker'
import { reportUpstreamPage } from '../../src/adapter/page-meta'

/**
 * `syncResourceType` pages with `while (true)` and one exit:
 * `if (items.length < this.pageSize) break`.
 *
 * That termination condition assumes the adapter honours `page`. An adapter
 * that ignores it — returning the same full page forever — never satisfies it,
 * and the worker spins indefinitely, re-writing the same rows and holding a
 * job in `running` with no error and no end.
 *
 * This is not hypothetical. Xero's `listAccounts` ignored its params entirely
 * until Finding 16 was fixed, and any of the other 1,544 adapters may do the
 * same at any resource. A loop whose exit depends on 1,545 third-party
 * implementations all behaving needs its own bound.
 *
 * The cap turns an infinite loop into a bounded, typed, logged failure.
 */

interface FakeAdapter {
  readonly platform: string
  readonly version: string
  readonly capabilities?: { maxPageSize?: number }
  refreshCredentials(creds: { accessToken: string }): Promise<{ accessToken: string }>
  listInvoices?: (creds: unknown, params: unknown) => Promise<Array<{ id: string }>>
  getAuthUrl(state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }>
}

class FakeCredentialStore {
  private rows = new Map<string, unknown>()
  private creds = new Map<string, { accessToken: string }>()
  seed(id: string, platform: string, vertical: string): void {
    const now = Date.now()
    this.rows.set(id, {
      id, vertical, platform, tenantId: null, ownerTenantId: null,
      label: null, expiresAt: null, createdAt: now, updatedAt: now,
    })
    this.creds.set(id, { accessToken: 'seed-token' })
  }
  loadById(id: string) { return this.creds.get(id) ?? null }
  getRow(id: string) { return this.rows.get(id) ?? null }
  updateById(id: string, fresh: { accessToken: string }) { this.creds.set(id, fresh) }
}

const noopRefresher: TokenRefresherLike<FakeAdapter> = {
  async ensureFresh(_a, c) { return c as { accessToken: string } },
}

describe('SyncWorker pagination is bounded', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore
  let credStore: FakeCredentialStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-swcap-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
    credStore = new FakeCredentialStore()
  })

  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('terminates against an adapter that ignores `page` and always returns a full page', async () => {
    let calls = 0
    const PAGE = 5
    const adapter: FakeAdapter = {
      platform: 'badpager',
      version: '1',
      async refreshCredentials(c) { return c },
      getAuthUrl: () => '',
      async exchangeCode() { return { accessToken: 'x' } },
      // Ignores `page` entirely — exactly the shape Xero's listAccounts had.
      listInvoices: async () => {
        calls++
        return Array.from({ length: PAGE }, (_, i) => ({ id: `inv-${i}` }))
      },
    }

    credStore.seed('conn-1', 'badpager', 'accounting')
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: (s: string) => (s === 'badpager' ? adapter : null) } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: PAGE, maxPagesPerResource: 10 },
    })

    await syncStore.create('accounting', 'conn-1', 'badpager', null, null)
    worker.start()

    const deadline = Date.now() + 8000
    let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
    while (Date.now() < deadline) {
      job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'completed' || job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    // The assertion that matters: it stopped at all.
    expect(job?.status === 'completed' || job?.status === 'failed').toBe(true)
    // And stopped at the cap rather than running away.
    expect(calls).toBeLessThanOrEqual(10)
    expect(calls).toBeGreaterThan(1)
  })

  it('does not cap a well-behaved adapter that reaches its last page', async () => {
    // The cap must not truncate a legitimate multi-page sync, or it trades an
    // infinite loop for silent data loss.
    const PAGE = 5
    const TOTAL = 12
    const adapter: FakeAdapter = {
      platform: 'goodpager',
      version: '1',
      async refreshCredentials(c) { return c },
      getAuthUrl: () => '',
      async exchangeCode() { return { accessToken: 'x' } },
      listInvoices: async (_c, params) => {
        const page = (params as { page: number }).page
        const start = (page - 1) * PAGE
        return Array.from({ length: Math.max(0, Math.min(PAGE, TOTAL - start)) }, (_, i) => ({
          id: `inv-${start + i}`,
        }))
      },
    }

    credStore.seed('conn-2', 'goodpager', 'accounting')
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: (s: string) => (s === 'goodpager' ? adapter : null) } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: PAGE, maxPagesPerResource: 10 },
    })

    await syncStore.create('accounting', 'conn-2', 'goodpager', null, null)
    worker.start()

    const deadline = Date.now() + 8000
    let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
    while (Date.now() < deadline) {
      job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'completed' || job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    expect(job?.status).toBe('completed')
    expect((await resourceStore.list('accounting', 'goodpager', 'conn-2', 'invoices')).length).toBe(TOTAL)
  })


  /**
   * A platform whose page ceiling is BELOW the worker's page size.
   *
   * HubSpot rejects any `limit` over 100 outright — `400 VALIDATION_ERROR: "You
   * can only request at most 100 objects in one request."` — against a worker
   * default of 500, so every HubSpot sync failed on its first request.
   *
   * The fix cannot be to clamp the request alone. `syncResourceType` ends a
   * collection when a page returns FEWER rows than it asked for, so requesting
   * 500 while the adapter silently caps at 100 makes the first full page look
   * like the last: the sync stops at 100 records AND calls
   * `markCollectionComplete`, after which an unfiltered list is served from a
   * truncated cache as though it were whole. That is strictly worse than the
   * 400 it replaces, which is why the declared ceiling has to reach the
   * termination test and not just the query string.
   */
  describe('a declared page-size ceiling', () => {
    it('clamps the request AND the short-page test, so a capped sync still completes fully', async () => {
      const CEILING = 3
      const TOTAL = 7
      const requested: number[] = []
      const adapter: FakeAdapter = {
        platform: 'cappedpager',
        version: '1',
        capabilities: { maxPageSize: CEILING },
        async refreshCredentials(c) { return c },
        getAuthUrl: () => '',
        async exchangeCode() { return { accessToken: 'x' } },
        listInvoices: async (_c, params) => {
          const { page, limit } = params as { page: number; limit: number }
          requested.push(limit)
          // Stands in for the platform: anything above the ceiling is refused.
          if (limit > CEILING) throw new Error(`400: at most ${CEILING} objects in one request`)
          const start = (page - 1) * limit
          return Array.from({ length: Math.max(0, Math.min(limit, TOTAL - start)) }, (_, i) => ({
            id: `inv-${start + i}`,
          }))
        },
      }

      credStore.seed('conn-3', 'cappedpager', 'accounting')
      const worker = new SyncWorker<FakeAdapter>({
        vertical: 'accounting',
        syncStore,
        credentialStore: credStore as never,
        registry: { get: (s: string) => (s === 'cappedpager' ? adapter : null) } as never,
        circuitBreaker: new CircuitBreaker(),
        resourceStore,
        tokenRefresher: noopRefresher,
        listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
        // 500 is the real default, and the number that produced the 400.
        config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: 500, maxPagesPerResource: 10 },
      })

      await syncStore.create('accounting', 'conn-3', 'cappedpager', null, null)
      worker.start()

      const deadline = Date.now() + 8000
      let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      while (Date.now() < deadline) {
        job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
        if (job?.status === 'completed' || job?.status === 'failed') break
        await new Promise((r) => setTimeout(r, 25))
      }
      await worker.stop()

      // Never asked for more than the platform accepts — no 400.
      expect(requested.every((l) => l <= CEILING)).toBe(true)
      expect(job?.status).toBe('completed')
      // The half that matters: all 7 rows, not the first 3. Comparing a full
      // 3-row page against the un-clamped 500 would have ended the sync here.
      expect((await resourceStore.list('accounting', 'cappedpager', 'conn-3', 'invoices')).length).toBe(TOTAL)
    })

    it('leaves an adapter that declares no ceiling on the configured page size', async () => {
      const seen: number[] = []
      const adapter: FakeAdapter = {
        platform: 'nolimit',
        version: '1',
        async refreshCredentials(c) { return c },
        getAuthUrl: () => '',
        async exchangeCode() { return { accessToken: 'x' } },
        listInvoices: async (_c, params) => {
          seen.push((params as { limit: number }).limit)
          return []
        },
      }

      credStore.seed('conn-4', 'nolimit', 'accounting')
      const worker = new SyncWorker<FakeAdapter>({
        vertical: 'accounting',
        syncStore,
        credentialStore: credStore as never,
        registry: { get: (s: string) => (s === 'nolimit' ? adapter : null) } as never,
        circuitBreaker: new CircuitBreaker(),
        resourceStore,
        tokenRefresher: noopRefresher,
        listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
        config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: 250, maxPagesPerResource: 10 },
      })

      await syncStore.create('accounting', 'conn-4', 'nolimit', null, null)
      worker.start()
      const deadline = Date.now() + 8000
      let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      while (Date.now() < deadline) {
        job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
        if (job?.status === 'completed' || job?.status === 'failed') break
        await new Promise((r) => setTimeout(r, 25))
      }
      await worker.stop()

      expect(seen[0]).toBe(250)
    })

    it('pages on past a full page the adapter reports as smaller than it was asked for', async () => {
      // One endpoint of an adapter with a lower ceiling than the rest (JD.com
      // promotions: 10) cannot be described by the adapter-wide maxPageSize.
      // The method reports the size it sent; judged against the 500 the worker
      // asked for, its full page of 3 would end the sync after 3 rows and mark
      // the collection complete.
      const CEILING = 3
      const TOTAL = 7
      const adapter: FakeAdapter = {
        platform: 'reportedcap',
        version: '1',
        async refreshCredentials(c) { return c },
        getAuthUrl: () => '',
        async exchangeCode() { return { accessToken: 'x' } },
        listInvoices: async (_c, params) => {
          const p = params as { page: number; limit: number }
          const size = Math.min(p.limit, CEILING)
          reportUpstreamPage(params as never, { pageSize: size })
          const start = (p.page - 1) * size
          return Array.from({ length: Math.max(0, Math.min(size, TOTAL - start)) }, (_, i) => ({
            id: `inv-${start + i}`,
          }))
        },
      }

      credStore.seed('conn-6', 'reportedcap', 'accounting')
      const worker = new SyncWorker<FakeAdapter>({
        vertical: 'accounting',
        syncStore,
        credentialStore: credStore as never,
        registry: { get: (s: string) => (s === 'reportedcap' ? adapter : null) } as never,
        circuitBreaker: new CircuitBreaker(),
        resourceStore,
        tokenRefresher: noopRefresher,
        listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
        config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: 500, maxPagesPerResource: 10 },
      })

      await syncStore.create('accounting', 'conn-6', 'reportedcap', null, null)
      worker.start()
      const deadline = Date.now() + 8000
      let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      while (Date.now() < deadline) {
        job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
        if (job?.status === 'completed' || job?.status === 'failed') break
        await new Promise((r) => setTimeout(r, 25))
      }
      await worker.stop()

      expect(job?.status).toBe('completed')
      expect(
        (await resourceStore.list('accounting', 'reportedcap', 'conn-6', 'invoices')).length,
      ).toBe(TOTAL)
    })

    it.each([
      ['fractional', 50.5],
      ['zero', 0],
      ['Infinity', Number.POSITIVE_INFINITY],
    ])('ignores a %s declaration, as the router does', async (_label, maxPageSize) => {
      // The router's parseListQuery honours only a finite integer ≥ 1. A
      // worker that accepted 50.5 asked the platform for 50.5 rows while the
      // API path asked the same adapter for its default: two readers of one
      // capability disagreeing about the page size, the thing it exists to
      // prevent.
      const seen: number[] = []
      const adapter: FakeAdapter = {
        platform: 'oddcap',
        version: '1',
        capabilities: { maxPageSize },
        async refreshCredentials(c) { return c },
        getAuthUrl: () => '',
        async exchangeCode() { return { accessToken: 'x' } },
        listInvoices: async (_c, params) => {
          seen.push((params as { limit: number }).limit)
          return []
        },
      }

      credStore.seed('conn-5', 'oddcap', 'accounting')
      const worker = new SyncWorker<FakeAdapter>({
        vertical: 'accounting',
        syncStore,
        credentialStore: credStore as never,
        registry: { get: (s: string) => (s === 'oddcap' ? adapter : null) } as never,
        circuitBreaker: new CircuitBreaker(),
        resourceStore,
        tokenRefresher: noopRefresher,
        listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
        config: { pollIntervalMs: 20, maxConcurrency: 1, pageSize: 250, maxPagesPerResource: 10 },
      })

      await syncStore.create('accounting', 'conn-5', 'oddcap', null, null)
      worker.start()
      const deadline = Date.now() + 8000
      let job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      while (Date.now() < deadline) {
        job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
        if (job?.status === 'completed' || job?.status === 'failed') break
        await new Promise((r) => setTimeout(r, 25))
      }
      await worker.stop()

      expect(seen[0]).toBe(250)
    })
  })
})
