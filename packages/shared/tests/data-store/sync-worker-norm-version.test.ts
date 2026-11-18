/**
 * A sync writes rows a reader will actually serve, and vouches for a
 * collection only when it knows where the collection ends.
 *
 * Readers filter on the normalizer version (`normalizerVersion` in
 * integration-server), and the sync worker never stamped one — it called
 * `upsertMany` and `markCollectionComplete` without it. So nothing a sync
 * wrote was ever served: after a sync the first unfiltered list was
 * `miss / reason: version` and went upstream (observed live, 2026-09-22).
 * Worse, the unversioned upsert OVERWROTE rows a read had stamped, so while a
 * sync ran, a cached list served its collection minus every row the sync had
 * touched.
 *
 * Stamping alone would have been unsafe. Most adapters give the worker no
 * stop signal — no reported `hasMore`, no declared `maxPageSize` — so their
 * end is a guess from a short page, and a platform capping pages below the
 * worker's 500 makes the first page look like the last. Such a sync used to
 * be harmless only because nothing read it. So:
 *
 *   known end   (reported hasMore, or a declared maxPageSize)
 *               -> mark complete, stamped: served from cache
 *   guessed end -> INVALIDATE any marker a read left behind: the next list goes
 *               upstream, as every post-sync list did before, deliberately now
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

const V = 'accounting'
const CONN = 'conn-1'
const TYPE = 'invoices'
const VERSION = 'norm-v1'
const PAGE = 5

class FakeCredentialStore {
  private rows = new Map<string, Record<string, unknown>>()
  seed(platform: string): void {
    const now = Date.now()
    this.rows.set(CONN, {
      id: CONN, vertical: V, platform, tenantId: null, ownerTenantId: null, label: null,
      expiresAt: null, createdAt: now, updatedAt: now,
    })
  }
  loadById(id: string) { return this.rows.has(id) ? { accessToken: 'seed-token' } : null }
  getRow(id: string) { return this.rows.get(id) ?? null }
  updateById() { /* no-op */ }
}

/** `n` rows over pages of PAGE; the last page is short. */
function pagesOf(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))
  return (page: number) => all.slice((page - 1) * PAGE, page * PAGE)
}

describe('sync worker stamps what it writes, and vouches only for a known end', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-swnv-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function sync(
    listInvoices: ListFn,
    opts: { maxPageSize?: number; version?: string | null } = {},
  ) {
    const platform = 'fake'
    const adapter = {
      platform,
      version: '1',
      ...(opts.maxPageSize ? { capabilities: { maxPageSize: opts.maxPageSize } } : {}),
      async refreshCredentials(c: unknown) { return c },
      getAuthUrl: () => '',
      async exchangeCode() { return { accessToken: 'x' } },
      listInvoices,
    }
    const credStore = new FakeCredentialStore()
    credStore.seed(platform)
    const refresher: TokenRefresherLike<typeof adapter> = {
      async ensureFresh(_a, c) { return c as { accessToken: string } },
    }
    const version = opts.version === undefined ? VERSION : opts.version
    const worker = new SyncWorker<typeof adapter>({
      vertical: V,
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: refresher,
      listableResources: [{ resourceType: TYPE, method: 'listInvoices' }],
      config: { pollIntervalMs: 50, pageSize: PAGE, maxPagesPerResource: 10 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      ...(version === null ? {} : { normalizerVersion: () => version }),
    })
    const job = await syncStore.create(V, CONN, platform, null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return (await syncStore.get(job.id))!
  }

  const servable = async () =>
    (await resourceStore.listWithMeta('accounting', 'fake', CONN, TYPE, { normVersion: VERSION })).data
  const vouchedFor = () => resourceStore.collectionCompletedAt(V, 'fake', CONN, TYPE, VERSION)

  it('stamps every row it writes with the normalizer version readers filter on', async () => {
    const page = pagesOf(7)
    const job = await sync(async (_c, p) => {
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    })
    expect(job.status).toBe('completed')
    expect(await servable()).toHaveLength(7)
  })

  it('vouches for the collection when the adapter reported where it ends', async () => {
    const page = pagesOf(7)
    await sync(async (_c, p) => {
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    })
    expect(await vouchedFor()).not.toBeNull()
  })

  it('vouches for the collection when the adapter declares its page size', async () => {
    // A declared ceiling makes the short-page test sound: the worker asks for
    // what the platform will fill, so a short page really is the last.
    const page = pagesOf(7)
    await sync(async (_c, p) => page(p.page), { maxPageSize: PAGE })
    expect(await vouchedFor()).not.toBeNull()
  })

  it('does not vouch for a collection whose end was only guessed from a short page', async () => {
    const page = pagesOf(7)
    const job = await sync(async (_c, p) => page(p.page))
    expect(job.status).toBe('completed')
    expect(await vouchedFor()).toBeNull()
    // Still written, and stamped — a by-id read may serve these rows.
    expect(await servable()).toHaveLength(7)
  })

  it('drops a marker a read left behind when its own end was only guessed', async () => {
    // A read-through that fetched a whole collection marks it complete. A
    // later sync that cannot vouch for the collection must not leave that
    // marker standing over rows it has just rewritten: before, the sync's
    // unversioned write nulled the marker's version, which sent the next list
    // upstream. That is kept — on purpose now.
    await resourceStore.markCollectionComplete(V, 'fake', CONN, TYPE, VERSION)
    const page = pagesOf(7)
    await sync(async (_c, p) => page(p.page))
    expect(await vouchedFor()).toBeNull()
  })

  it('without a normalizer version, still vouches only for a known end', async () => {
    // Embedders that do not version their cache keep unversioned rows, and
    // the same rule about what a sync may vouch for.
    const known = pagesOf(7)
    await sync(
      async (_c, p) => {
        reportUpstreamPage(p, { hasMore: p.page < 2 })
        return known(p.page)
      },
      { version: null },
    )
    expect(await resourceStore.collectionCompletedAt(V, 'fake', CONN, TYPE)).not.toBeNull()
    expect((await resourceStore.listWithMeta('accounting', 'fake', CONN, TYPE)).data).toHaveLength(7)
  })
})
