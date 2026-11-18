/**
 * A sync that reaches a KNOWN end removes cached rows the platform no longer
 * returns.
 *
 * The store never deleted a row the platform had deleted, so the cache kept
 * "ghosts" forever — and once a sync vouches for a collection, an unfiltered
 * list is served from the cache, ghosts included, as the whole collection.
 *
 * Every sync is a full sync (the worker never passes `updatedAfter`), and
 * `upsertMany` re-stamps `updated_at` on conflict, so after a sync that reached
 * a known end every row the platform still has is stamped at or after the
 * moment the sync started. Anything older is gone upstream. The sweep removes
 * exactly that, and nothing when:
 *
 *   - the end was only GUESSED from a short page (the sync may have stopped
 *     early, so absence proves nothing);
 *   - the sync failed or was aborted part-way;
 *   - it wrote no rows at all (an adapter that turns a 403 or 404 into `[]`
 *     would otherwise empty the cache) — and then it does not vouch for the
 *     rows it kept either.
 *
 * Rows another writer stores while the sync runs are stamped after the cutoff
 * and survive.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import type { Credentials } from '../../src/auth/store'
import { ResourceStore } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'
import { SyncWorker, type TokenRefresherLike } from '../../src/data-store/sync-worker'
import { CircuitBreaker } from '../../src/circuit-breaker'
import { reportUpstreamPage } from '../../src/adapter/page-meta'

type Row = { id: string }
type ListFn = (creds: unknown, params: { page: number; limit: number }) => Promise<Row[]>

const V = 'accounting'
const PLATFORM = 'fake'
const CONN = 'conn-1'
const TYPE = 'invoices'
const VERSION = 'norm-v1'
const PAGE = 5

class FakeCredentialStore {
  private rows = new Map<string, Record<string, unknown>>()
  seed(platform: string): void {
    const now = Date.now()
    this.rows.set(CONN, {
      id: CONN,
      vertical: V,
      platform,
      tenantId: null,
      ownerTenantId: null,
      label: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    })
  }
  loadById(id: string) {
    return this.rows.has(id) ? { accessToken: 'seed-token' } : null
  }
  getRow(id: string) {
    return this.rows.get(id) ?? null
  }
  updateById() {
    /* no-op */
  }
}

/** `n` rows (r0…) over pages of PAGE; the last page is short. */
function pagesOf(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({ id: `r${i}` }))
  return (page: number) => all.slice((page - 1) * PAGE, page * PAGE)
}

/** Resolves once `Date.now()` has moved past `t` — ordering, not a race. */
async function clockPast(t: number): Promise<void> {
  while (Date.now() <= t) await new Promise((r) => setTimeout(r, 1))
}

describe('sync worker sweeps rows the platform no longer returns', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-swsw-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    vi.restoreAllMocks()
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  function fakeAdapter(listInvoices: ListFn, maxPageSize?: number) {
    return {
      platform: PLATFORM,
      version: '1',
      ...(maxPageSize ? { capabilities: { maxPageSize } } : {}),
      async refreshCredentials(c: Credentials) {
        return c
      },
      getAuthUrl: () => '',
      async exchangeCode(): Promise<Credentials> {
        return { accessToken: 'x' }
      },
      listInvoices,
    }
  }

  function makeWorker(
    adapter: ReturnType<typeof fakeAdapter>,
    opts: {
      external?: unknown
      listableResources?: Array<{ resourceType: string; method: string }>
    } = {},
  ) {
    const credStore = new FakeCredentialStore()
    credStore.seed(PLATFORM)
    const refresher: TokenRefresherLike<typeof adapter> = {
      async ensureFresh(_a, c) {
        return c
      },
    }
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const worker = new SyncWorker<typeof adapter>({
      vertical: V,
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: refresher,
      listableResources: opts.listableResources ?? [{ resourceType: TYPE, method: 'listInvoices' }],
      config: { pollIntervalMs: 50, pageSize: PAGE, maxPagesPerResource: 10 },
      logger,
      normalizerVersion: () => VERSION,
      ...(opts.external ? { external: opts.external as never } : {}),
    })
    return { worker, logger }
  }

  async function sync(
    listInvoices: ListFn,
    opts: { maxPageSize?: number; external?: unknown } = {},
  ) {
    const { worker, logger } = makeWorker(fakeAdapter(listInvoices, opts.maxPageSize), opts)
    const job = await syncStore.create(V, CONN, PLATFORM, null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return { job: (await syncStore.get(job.id))!, logger }
  }

  /** Seed rows, then backdate EVERY row in the store a minute — well before
   *  any sync that follows starts, whatever the timer resolution. */
  async function seedOld(
    rows: Array<{
      id: string
      vertical?: string
      platform?: string
      tenant?: string
      type?: string
      version?: string
    }>,
  ) {
    for (const r of rows) {
      await resourceStore.upsert(
        r.vertical ?? V,
        r.platform ?? PLATFORM,
        r.tenant ?? CONN,
        r.type ?? TYPE,
        r.id,
        { id: r.id, seeded: true },
        r.version ?? VERSION,
      )
    }
    await handle.kysely
      .updateTable('resources')
      .set({ updated_at: Date.now() - 60_000 })
      .execute()
  }

  /** Every row of one collection, read straight off the table — no read
   *  filter (version, TTL) can hide a row the sweep failed to remove. */
  const cachedIds = async (
    at: { vertical?: string; platform?: string; tenant?: string; type?: string } = {},
  ) =>
    (
      (await handle.kysely
        .selectFrom('resources')
        .select(['resource_id'])
        .where('vertical', '=', at.vertical ?? V)
        .where('platform', '=', at.platform ?? PLATFORM)
        .where('tenant_id', '=', at.tenant ?? CONN)
        .where('resource_type', '=', at.type ?? TYPE)
        .execute()) as Array<{ resource_id: string }>
    )
      .map((r) => r.resource_id)
      .sort()

  const vouchedFor = () => resourceStore.collectionCompletedAt(V, PLATFORM, CONN, TYPE, VERSION)

  /** Seven rows over two pages, the adapter reporting where they end. */
  const reportedEnd = (): ListFn => {
    const page = pagesOf(7)
    return async (_c, p) => {
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    }
  }
  const SEVEN = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']

  it('1. a reported end (hasMore false) removes the ghost', async () => {
    await seedOld([{ id: 'ghost' }])

    const { job, logger } = await sync(reportedEnd())

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual(SEVEN)
    expect(logger.info).toHaveBeenCalledWith(
      `Sync job ${job.id}: removed 1 cached ${TYPE} no longer upstream`,
    )
  })

  it('2. a declared maxPageSize end removes the ghost', async () => {
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(7)

    const { job } = await sync(async (_c, p) => page(p.page), { maxPageSize: PAGE })

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual(SEVEN)
  })

  it('3. a guessed end (short page, nothing declared or reported) keeps the ghost', async () => {
    // A platform capping pages below the requested size makes the FIRST page
    // look like the last, so rows missing from this sync may simply be on a
    // page it never asked for.
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(7)

    const { job } = await sync(async (_c, p) => page(p.page))

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual([...SEVEN, 'ghost'].sort())
  })

  it('4. a row another writer stores during the first request survives', async () => {
    // A read-through or a write-through caching a row while page 1 is in
    // flight. It is newer than anything this sync can speak for — and older
    // than every row the sync stamps, so a cutoff taken from the sync's own
    // writes would remove it.
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(7)

    const { job } = await sync(async (_c, p) => {
      if (p.page === 1) {
        await resourceStore.upsert(V, PLATFORM, CONN, TYPE, 'during-1', { id: 'during-1' }, VERSION)
        const stamped = (await resourceStore.getWithMeta(V, PLATFORM, CONN, TYPE, 'during-1'))!
        await clockPast(stamped.updatedAt)
      }
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    })

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual([...SEVEN, 'during-1'].sort())
  })

  it('4b. a row another writer stores mid-sync (on page 2) survives', async () => {
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(7)

    const { job } = await sync(async (_c, p) => {
      if (p.page === 2) {
        await resourceStore.upsert(V, PLATFORM, CONN, TYPE, 'during-2', { id: 'during-2' }, VERSION)
        const stamped = (await resourceStore.getWithMeta(V, PLATFORM, CONN, TYPE, 'during-2'))!
        // Past its stamp before the sweep runs, so a cutoff taken at the end
        // of the sync would be strictly newer than this row.
        await clockPast(stamped.updatedAt)
      }
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    })

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual([...SEVEN, 'during-2'].sort())
  })

  it('5. leaves ghosts in another collection, connection, platform or vertical alone', async () => {
    await seedOld([
      { id: 'ghost' },
      { id: 'other-type', type: 'contacts' },
      { id: 'other-conn', tenant: 'conn-2' },
      { id: 'other-platform', platform: 'other' },
      { id: 'other-vertical', vertical: 'crm' },
    ])

    await sync(reportedEnd())

    expect(await cachedIds()).toEqual(SEVEN)
    expect(await cachedIds({ type: 'contacts' })).toEqual(['other-type'])
    expect(await cachedIds({ tenant: 'conn-2' })).toEqual(['other-conn'])
    expect(await cachedIds({ platform: 'other' })).toEqual(['other-platform'])
    expect(await cachedIds({ vertical: 'crm' })).toEqual(['other-vertical'])
  })

  it('6. a ghost stamped by an older normalizer version is removed too', async () => {
    // The sweep is about the platform's rows, not their shape: a row an older
    // build wrote is still a row the platform no longer has.
    await seedOld([{ id: 'ghost', version: 'norm-v0' }])

    await sync(reportedEnd())

    expect(await cachedIds()).toEqual(SEVEN)
  })

  it('7. a failure part-way removes nothing, and fails the job', async () => {
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(12)

    const { job } = await sync(async (_c, p) => {
      if (p.page === 2) throw new Error('upstream 503')
      reportUpstreamPage(p, { hasMore: true })
      return page(p.page)
    })

    expect(job.status).toBe('failed')
    expect(await cachedIds()).toEqual(['ghost', 'r0', 'r1', 'r2', 'r3', 'r4'])
  })

  it('8. a known end that wrote no rows removes nothing, and vouches for none of it', async () => {
    // Adapters that turn a 403 or 404 into `[]` exist; an empty answer is not
    // proof the collection is empty. Nor is it proof the rows kept are the
    // collection: a marker over them would serve every one of them — rows the
    // connection may no longer be able to read — as whole and fresh. A marker
    // over an EMPTY cache is no use either (a hit needs a row), so the sync
    // drops the marker, including one an earlier sync or read left behind.
    await seedOld([{ id: 'ghost' }, { id: 'also-cached' }])
    await resourceStore.markCollectionComplete(V, PLATFORM, CONN, TYPE, VERSION)

    const { job } = await sync(async (_c, p) => {
      reportUpstreamPage(p, { hasMore: false })
      return []
    })

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual(['also-cached', 'ghost'])
    expect(await vouchedFor()).toBeNull()
  })

  it('9. an unchanged row the sync returns again survives', async () => {
    // Pins the dependency the sweep rests on: `upsertMany` re-stamps
    // `updated_at` on conflict even when the data is byte-identical. If it
    // ever skipped unchanged rows, every stable row would look like a ghost.
    await seedOld([{ id: 'r3' }, { id: 'ghost' }])
    const page = pagesOf(7)

    await sync(async (_c, p) => {
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page).map((r) => (r.id === 'r3' ? { id: 'r3', seeded: true } : r))
    })

    expect(await cachedIds()).toEqual(SEVEN)
  })

  it('10. a sweep emits no event: only resource.synced is ever looked up', async () => {
    // Removing a ghost is cache housekeeping, not news from the platform — no
    // `resource.deleted`, no webhook.
    await seedOld([{ id: 'ghost' }])
    const matching = vi.fn(async () => [])

    await sync(reportedEnd(), {
      external: { webhookSubs: { matching }, resolveTenantId: () => 'tenant-1' },
    })

    expect(await cachedIds()).toEqual(SEVEN)
    expect(matching).toHaveBeenCalled()
    expect(new Set(matching.mock.calls.map((c) => (c as unknown[])[1]))).toEqual(
      new Set(['resource.synced']),
    )
  })

  describe('11. an end reached on an EMPTY last page still sweeps', () => {
    // A collection that is an exact multiple of the page size ends on a
    // request that returns nothing: the declared-size case always does, and so
    // does a cursor walk asked for the page past its last. The rows were
    // written on EARLIER pages, so the guard is on what the whole sync wrote.
    const TEN = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9']

    it('a reported end', async () => {
      await seedOld([{ id: 'ghost' }])
      const page = pagesOf(10)

      const { job } = await sync(async (_c, p) => {
        reportUpstreamPage(p, { hasMore: p.page < 3 })
        return page(p.page)
      })

      expect(job.status).toBe('completed')
      expect(await cachedIds()).toEqual(TEN)
      expect(await vouchedFor()).not.toBeNull()
    })

    it('a declared maxPageSize', async () => {
      await seedOld([{ id: 'ghost' }])
      const page = pagesOf(10)

      const { job } = await sync(async (_c, p) => page(p.page), { maxPageSize: PAGE })

      expect(job.status).toBe('completed')
      expect(await cachedIds()).toEqual(TEN)
      expect(await vouchedFor()).not.toBeNull()
    })
  })

  it('12. a wall clock stepping back mid-sync does not sweep the rows the sync just wrote', async () => {
    // An NTP correction between the cutoff and the first write stamps this
    // sync's own rows BEFORE the cutoff. Taken alone, the cutoff would then
    // remove every row the platform just returned and vouch for the rest. The
    // cutoff is the earlier of the start and the oldest stamp this sync wrote —
    // across ALL its pages, not the last one: page 1 is stamped 5s back, page
    // 2 5s ahead.
    await seedOld([{ id: 'ghost' }])
    const page = pagesOf(7)
    const realNow = Date.now
    let skew = 0
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + skew)

    const { job } = await sync(async (_c, p) => {
      skew = p.page === 1 ? -5_000 : 5_000
      reportUpstreamPage(p, { hasMore: p.page < 2 })
      return page(p.page)
    })

    expect(job.status).toBe('completed')
    expect(await cachedIds()).toEqual(SEVEN)
  })

  it('13. a sweep that fails leaves no marker, and fails the job', async () => {
    // The sweep runs BEFORE the marker, so a collection is never vouched for
    // while its ghosts are still in it.
    await seedOld([{ id: 'ghost' }])
    vi.spyOn(resourceStore, 'sweepCollection').mockRejectedValue(new Error('database is locked'))

    const { job } = await sync(reportedEnd())

    expect(job.status).toBe('failed')
    expect(await vouchedFor()).toBeNull()
  })

  it('14. two listable entries sharing a resource type are refused at construction', () => {
    // Each entry sweeps its own collection by resource type, so the second
    // would remove every row the first had just written.
    const adapter = fakeAdapter(reportedEnd())
    expect(() =>
      makeWorker(adapter, {
        listableResources: [
          { resourceType: 'contacts', method: 'listInvoices' },
          { resourceType: 'contacts', method: 'listInvoices' },
        ],
      }),
    ).toThrow(/contacts/)
  })
})
