/**
 * The sync worker ends a collection on the adapter's word when it gives one.
 *
 * It used to infer the end from a short page (`items.length < pageSize`).
 * That is wrong for any list whose page is not one upstream page of those
 * rows. Shopify's fulfillments are flattened from a page of 250 orders: a page
 * of orders with 40 fulfillments is "short" and the worker stopped, marking a
 * truncated collection complete. The adapter knows whether more orders remain;
 * it now says so through the page sink (`reportUpstreamPage(params, { hasMore })`)
 * and the worker believes it. Adapters that report nothing keep the old rule.
 *
 * Separately, an adapter that ignores `page` returns the same rows for every
 * page. The worker only noticed at `maxPagesPerResource` — 10,000 requests by
 * default. Two identical consecutive pages now fail the collection at once.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
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

type Row = { id: string }
type ListFn = (creds: unknown, params: { page: number; limit: number }) => Promise<Row[]>

class FakeCredentialStore {
  private rows = new Map<string, Record<string, unknown>>()
  seed(id: string, platform: string, vertical: string): void {
    const now = Date.now()
    this.rows.set(id, {
      id, vertical, platform, tenantId: null, ownerTenantId: null, label: null,
      expiresAt: null, createdAt: now, updatedAt: now,
    })
  }
  loadById(id: string) { return this.rows.has(id) ? { accessToken: 'seed-token' } : null }
  getRow(id: string) { return this.rows.get(id) ?? null }
  updateById() { /* no-op */ }
}

const PAGE = 5

describe('sync worker paging on the adapter’s word', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-swhm-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(listInvoices: ListFn, platform = 'fake') {
    const adapter = {
      platform,
      version: '1',
      async refreshCredentials(c: unknown) { return c },
      getAuthUrl: () => '',
      async exchangeCode() { return { accessToken: 'x' } },
      listInvoices,
    }
    const credStore = new FakeCredentialStore()
    credStore.seed('conn-1', platform, 'accounting')
    const refresher: TokenRefresherLike<typeof adapter> = {
      async ensureFresh(_a, c) { return c as { accessToken: string } },
    }
    const worker = new SyncWorker<typeof adapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: refresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 50, pageSize: PAGE, maxPagesPerResource: 10 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const job = await syncStore.create('accounting', 'conn-1', platform, null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return {
      job: (await syncStore.get(job.id))!,
      rows: await resourceStore.list('accounting', platform, 'conn-1', 'invoices'),
    }
  }

  it('keeps going past a short page, and an empty one, while the adapter says there is more', async () => {
    // Pages shaped like fulfillments flattened from pages of orders.
    const pages: Row[][] = [[{ id: 'a' }, { id: 'b' }], [], [{ id: 'c' }, { id: 'd' }, { id: 'e' }]]
    const listInvoices = vi.fn<ListFn>(async (_c, params) => {
      const i = params.page - 1
      reportUpstreamPage(params, { hasMore: i < pages.length - 1 })
      return pages[i] ?? []
    })
    const { job, rows } = await run(listInvoices)
    expect(job.status).toBe('completed')
    expect(rows.map((r) => (r as Row).id).sort()).toEqual(['a', 'b', 'c', 'd', 'e'])
    expect(listInvoices).toHaveBeenCalledTimes(3)
  })

  it('stops on a full page when the adapter says it was the last', async () => {
    // A collection that is an exact multiple of the page size costs no extra
    // empty request.
    const listInvoices = vi.fn<ListFn>(async (_c, params) => {
      reportUpstreamPage(params, { hasMore: false })
      return params.page === 1
        ? Array.from({ length: PAGE }, (_, i) => ({ id: `r${i}` }))
        : []
    })
    const { job, rows } = await run(listInvoices)
    expect(job.status).toBe('completed')
    expect(rows).toHaveLength(PAGE)
    expect(listInvoices).toHaveBeenCalledTimes(1)
  })

  it('keeps the short-page rule for adapters that report nothing', async () => {
    const listInvoices = vi.fn<ListFn>(async (_c, params) =>
      params.page === 1 ? Array.from({ length: PAGE }, (_, i) => ({ id: `r${i}` })) : [{ id: 'last' }],
    )
    const { job, rows } = await run(listInvoices)
    expect(job.status).toBe('completed')
    expect(rows).toHaveLength(PAGE + 1)
    expect(listInvoices).toHaveBeenCalledTimes(2)
  })

  it('fails at the second identical page instead of the page ceiling', async () => {
    const listInvoices = vi.fn<ListFn>(async () =>
      Array.from({ length: PAGE }, (_, i) => ({ id: `same-${i}` })),
    )
    const { job } = await run(listInvoices, 'badpager')
    expect(job.status).toBe('failed')
    expect(listInvoices).toHaveBeenCalledTimes(2)
    expect(String(job.progress?.invoices?.error)).toMatch(/same \d+ rows/)
    expect(String(job.progress?.invoices?.error)).toMatch(/`page`/)
  })
})
