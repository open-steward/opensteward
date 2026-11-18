/**
 * SyncWorker generic tests.
 *
 * Exercises the shared `SyncWorker<TAdapter>` against a fake adapter so
 * coverage applies to every vertical at once.
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

interface FakeConnectionRow {
  id: string
  vertical: string | null
  platform: string
  tenantId: string | null
  ownerTenantId: string | null
  label: string | null
  expiresAt: number | null
  createdAt: number
  updatedAt: number
}

class FakeCredentialStore {
  private rows = new Map<string, FakeConnectionRow>()
  private creds = new Map<string, { accessToken: string; expiresAt?: Date }>()

  seed(id: string, platform: string, vertical: string, opts?: { ownerTenantId?: string }): void {
    const now = Date.now()
    this.rows.set(id, {
      id,
      vertical,
      platform,
      tenantId: null,
      ownerTenantId: opts?.ownerTenantId ?? null,
      label: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    })
    this.creds.set(id, { accessToken: 'seed-token' })
  }

  loadById(id: string) {
    return this.creds.get(id) ?? null
  }

  getRow(id: string) {
    return this.rows.get(id) ?? null
  }

  updateById(id: string, fresh: { accessToken: string; expiresAt?: Date }) {
    this.creds.set(id, fresh)
  }
}

interface FakeAdapter {
  readonly platform: string
  readonly version: string
  refreshCredentials(creds: { accessToken: string }): Promise<{ accessToken: string }>
  listInvoices?: (creds: unknown, params: unknown) => Promise<Array<{ id: string }>>
  listContacts?: (creds: unknown, params: unknown) => Promise<Array<{ id: string }>>
  getAuthUrl(state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }>
}

function fakeAdapter(platform: string, methods: Partial<FakeAdapter>): FakeAdapter {
  return {
    platform,
    version: '1',
    async refreshCredentials(c) {
      return c
    },
    getAuthUrl: () => '',
    async exchangeCode() {
      return { accessToken: 'x' }
    },
    ...methods,
  }
}

class FakeRegistry {
  constructor(private adapters: Record<string, FakeAdapter>) {}
  get(slug: string) {
    return this.adapters[slug] ?? null
  }
}

const noopRefresher: TokenRefresherLike<FakeAdapter> = {
  async ensureFresh(_a, c) {
    return c as { accessToken: string; expiresAt?: Date }
  },
}

describe('SyncWorker', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore
  let credStore: FakeCredentialStore
  let breaker: CircuitBreaker

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-sw-'))
    // ResourceStore + SyncStore share one data handle (like boot); SyncStore
    // borrows it via resourceStore.getHandle().
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
    credStore = new FakeCredentialStore()
    breaker = new CircuitBreaker()
  })

  afterEach(async () => {
    // Borrowers — close the shared handle once, not each store.
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('processes a pending job and writes pages into ResourceStore', async () => {
    credStore.seed('conn-1', 'fortnox', 'accounting')
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async () => [{ id: 'a' }, { id: 'b' }],
      listContacts: async () => [{ id: 'c1' }],
    })
    const registry = new FakeRegistry({ fortnox: adapter })

    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [
        { resourceType: 'invoices', method: 'listInvoices' },
        { resourceType: 'contacts', method: 'listContacts' },
        { resourceType: 'bills', method: 'listBills' }, // missing — should skip
      ],
      config: { pollIntervalMs: 50, maxConcurrency: 1, pageSize: 500 },
    })

    await syncStore.create('accounting', 'conn-1', 'fortnox', null, null)
    worker.start()

    // Drain the worker — give it up to 2s to finish
    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'completed' || job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]!
    expect(job.status).toBe('completed')
    expect(job.progress?.invoices?.synced).toBe(2)
    expect(job.progress?.contacts?.synced).toBe(1)
    expect(job.progress?.bills?.status).toBe('skipped')

    expect((await resourceStore.list('accounting', 'fortnox', 'conn-1', 'invoices')).length).toBe(2)
    expect((await resourceStore.list('accounting', 'fortnox', 'conn-1', 'contacts')).length).toBe(1)
  })

  it('marks job failed when adapter throws', async () => {
    credStore.seed('conn-2', 'fortnox', 'accounting')
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async () => {
        throw new Error('upstream 503')
      },
    })
    const registry = new FakeRegistry({ fortnox: adapter })
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 50 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    await syncStore.create('accounting', 'conn-2', 'fortnox', null, null)
    worker.start()

    const deadline = Date.now() + 2000
    while (Date.now() < deadline) {
      const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'completed' || job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]!
    expect(job.status).toBe('failed')
    expect(job.progress?.invoices?.status).toBe('failed')
  })

  it('marks job failed when adapter slug is unknown', async () => {
    credStore.seed('conn-3', 'unknown', 'accounting')
    const registry = new FakeRegistry({})
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [],
      config: { pollIntervalMs: 50 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })

    await syncStore.create('accounting', 'conn-3', 'unknown', null, null)
    worker.start()

    const deadline = Date.now() + 1500
    while (Date.now() < deadline) {
      const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]!
    expect(job.status).toBe('failed')
    expect(job.error).toContain('Unknown platform')
  })

  it('paginates: stops when fewer than pageSize items returned', async () => {
    credStore.seed('conn-4', 'fortnox', 'accounting')
    let calls = 0
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async (_c, params: unknown) => {
        calls++
        const p = params as { page?: number; limit?: number }
        // Page 1 returns full page, page 2 returns half (signals end).
        if (p.page === 1) return Array.from({ length: 500 }, (_, i) => ({ id: `inv-${i}` }))
        return Array.from({ length: 10 }, (_, i) => ({ id: `inv-p2-${i}` }))
      },
    })
    const registry = new FakeRegistry({ fortnox: adapter })
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 50, pageSize: 500 },
    })

    await syncStore.create('accounting', 'conn-4', 'fortnox', null, null)
    worker.start()
    const deadline = Date.now() + 3000
    while (Date.now() < deadline) {
      const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]
      if (job?.status === 'completed' || job?.status === 'failed') break
      await new Promise((r) => setTimeout(r, 25))
    }
    await worker.stop()

    expect(calls).toBe(2)
    const job = (await syncStore.list({ vertical: 'accounting', limit: 1 }))[0]!
    expect(job.status).toBe('completed')
    expect(job.progress?.invoices?.synced).toBe(510)
  })

  it('onJobComplete fires once on success with status="completed"', async () => {
    credStore.seed('conn-ok', 'fortnox', 'accounting')
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async () => [{ id: 'a' }],
    })
    const registry = new FakeRegistry({ fortnox: adapter })
    const calls: Array<{ id: string; status: 'completed' | 'failed' }> = []

    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 60_000 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onJobComplete: (j, s) => {
        calls.push({ id: j.id, status: s })
      },
    })
    const job = await syncStore.create('accounting', 'conn-ok', 'fortnox', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, sig: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({ id: job.id, status: 'completed' })
    expect((await syncStore.get(job.id))?.status).toBe('completed')
  })

  it('onJobComplete fires with status="failed" when a resource list throws', async () => {
    credStore.seed('conn-fail', 'fortnox', 'accounting')
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async () => {
        throw new Error('upstream 500')
      },
    })
    const registry = new FakeRegistry({ fortnox: adapter })
    const calls: Array<{ status: 'completed' | 'failed' }> = []

    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 60_000 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      onJobComplete: (_j, s) => {
        calls.push({ status: s })
      },
    })
    const job = await syncStore.create('accounting', 'conn-fail', 'fortnox', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, sig: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    expect(calls).toEqual([{ status: 'failed' }])
    expect((await syncStore.get(job.id))?.status).toBe('failed')
  })

  it('onJobComplete errors are swallowed (worker keeps running)', async () => {
    credStore.seed('conn-hookerr', 'fortnox', 'accounting')
    const adapter = fakeAdapter('fortnox', {
      listInvoices: async () => [{ id: 'a' }],
    })
    const registry = new FakeRegistry({ fortnox: adapter })
    const errorLog = vi.fn()

    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 60_000 },
      logger: { info: vi.fn(), warn: vi.fn(), error: errorLog },
      onJobComplete: () => {
        throw new Error('hook bug')
      },
    })
    const job = await syncStore.create('accounting', 'conn-hookerr', 'fortnox', null, null)
    // Must not throw — error log captures it instead.
    await expect(
      (
        worker as unknown as { processJob: (j: unknown, sig: AbortSignal) => Promise<void> }
      ).processJob(job, new AbortController().signal),
    ).resolves.toBeUndefined()
    expect(errorLog).toHaveBeenCalled()
    expect((await syncStore.get(job.id))?.status).toBe('completed')
  })

  it('resetRunning recovers crashed jobs on start', async () => {
    const job = await syncStore.create('accounting', 'conn-5', 'fortnox', null, null)
    await syncStore.markRunning(job.id)
    expect((await syncStore.get(job.id))?.status).toBe('running')

    // New worker instantiation triggers resetRunning(vertical) on start.
    const registry = new FakeRegistry({ fortnox: fakeAdapter('fortnox', {}) })
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: registry as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [],
      config: { pollIntervalMs: 60_000 }, // never poll during this test
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    await worker.start()
    expect((await syncStore.get(job.id))?.status).toBe('pending')
    await worker.stop()
  })

  it('never runs two syncs of one connection: a cancelled run still holds it here', async () => {
    // An admin cancel marks a running job failed, which frees the connection's
    // database slot (idx_sync_jobs_one_active) — but nothing interrupts the
    // run. A new job for that connection must wait until the old run settles.
    credStore.seed('conn-a', 'fortnox', 'accounting')
    credStore.seed('conn-b', 'fortnox', 'accounting')
    let release!: () => void
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let calls = 0
    const adapter = fakeAdapter('fortnox', {
      // The first run (conn-a's first job) blocks until released; later runs
      // return at once.
      listInvoices: async () => {
        if (calls++ === 0) await gate
        return [{ id: 'inv-1' }]
      },
    })
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: new FakeRegistry({ fortnox: adapter }) as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 20, maxConcurrency: 2 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const statusOf = async (id: string) => (await syncStore.get(id))?.status
    const waitFor = async (cond: () => Promise<boolean>, ms = 2_000) => {
      const deadline = Date.now() + ms
      while (!(await cond())) {
        if (Date.now() > deadline) throw new Error('timed out waiting')
        await new Promise((r) => setTimeout(r, 10))
      }
    }

    const enqueue = (connectionId: string) =>
      syncStore.createIfIdle({
        vertical: 'accounting',
        connectionId,
        platform: 'fortnox',
        tenantId: null,
        origin: 'manual',
      })
    const first = (await enqueue('conn-a')).job
    await worker.start()
    try {
      await waitFor(async () => calls === 1)

      await syncStore.markFailed(first.id, 'cancelled by admin')
      const second = await enqueue('conn-a')
      expect(second.created).toBe(true)
      const other = (await enqueue('conn-b')).job

      // Another connection's job still runs: the busy connection is skipped,
      // not a block on the queue.
      await waitFor(async () => (await statusOf(other.id)) === 'completed')
      // Give the worker several more polls to (wrongly) claim the second job.
      await new Promise((r) => setTimeout(r, 150))
      expect(await statusOf(second.job.id)).toBe('pending')
      expect(calls).toBe(2)

      release()
      await waitFor(async () => (await statusOf(second.job.id)) === 'completed')
      expect(calls).toBe(3)
    } finally {
      release()
      await worker.stop()
    }
  })
})
