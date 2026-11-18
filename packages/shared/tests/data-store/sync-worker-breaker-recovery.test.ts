/**
 * A connection whose circuit breaker has tripped must be able to recover.
 *
 * Seen 2026-09-13 on a Shopify connection: one job with six failing
 * collections opened the breaker (threshold 5). Every job after it — nine
 * hours later, long past the 30 s cooldown — failed every collection with
 * "Circuit breaker opened during sync" without a single request reaching
 * Shopify, until the process was restarted.
 *
 * Cause: the worker asked `isOpen()` twice per job — once at job start, once
 * per collection. In half-open, `isOpen()` GRANTS the single probe and returns
 * false. The job-level call took the probe; the per-collection call saw a
 * probe in flight and threw. Nothing was requested, so nothing ever called
 * recordSuccess/recordFailure to release it: the connection was locked out
 * for the life of the process.
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

interface FakeAdapter {
  readonly platform: string
  readonly version: string
  refreshCredentials(c: { accessToken: string }): Promise<{ accessToken: string }>
  listInvoices: (creds: unknown, params: unknown) => Promise<Array<{ id: string }>>
  listContacts: (creds: unknown, params: unknown) => Promise<Array<{ id: string }>>
  getAuthUrl(state: string): string
  exchangeCode(code: string, redirectUri: string): Promise<{ accessToken: string }>
}

const noopRefresher: TokenRefresherLike<FakeAdapter> = {
  async ensureFresh(_a, c) { return c as { accessToken: string } },
}

describe('circuit breaker recovery across sync jobs', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-swb-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  it('a job after the cooldown reaches the platform again and closes the circuit', async () => {
    // Two collections failing once each is enough to trip a threshold of 2.
    const breaker = new CircuitBreaker(2, 100)
    let upstreamDown = true
    const adapter: FakeAdapter = {
      platform: 'fortnox',
      version: '1',
      async refreshCredentials(c) { return c },
      getAuthUrl: () => '',
      async exchangeCode() { return { accessToken: 'x' } },
      listInvoices: async () => {
        if (upstreamDown) throw new Error('upstream 503')
        return [{ id: 'inv-1' }]
      },
      listContacts: async () => {
        if (upstreamDown) throw new Error('upstream 503')
        return [{ id: 'c-1' }]
      },
    }
    const credStore = new FakeCredentialStore()
    credStore.seed('conn-1', 'fortnox', 'accounting')
    const worker = new SyncWorker<FakeAdapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: noopRefresher,
      listableResources: [
        { resourceType: 'invoices', method: 'listInvoices' },
        { resourceType: 'contacts', method: 'listContacts' },
      ],
      config: { pollIntervalMs: 50 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const run = async () => {
      const job = await syncStore.create('accounting', 'conn-1', 'fortnox', null, null)
      await (
        worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
      ).processJob(job, new AbortController().signal)
      return (await syncStore.get(job.id))!
    }

    // Job 1: the platform is down; both collections fail; the circuit opens.
    const first = await run()
    expect(first.status).toBe('failed')
    expect(breaker.isOpen('conn-1')).toBe(true)

    // The platform comes back, the cooldown passes.
    upstreamDown = false
    await new Promise((r) => setTimeout(r, 150))

    // Job 2: must probe the platform, succeed, and close the circuit — not
    // fail every collection without a request.
    const second = await run()
    expect(second.progress?.invoices).toMatchObject({ status: 'completed', synced: 1 })
    expect(second.progress?.contacts).toMatchObject({ status: 'completed', synced: 1 })
    expect(second.status).toBe('completed')

    // Job 3, straight after: nothing is left claimed.
    const third = await run()
    expect(third.status).toBe('completed')
  })

  it('a job inside the cooldown is refused up front, and does not consume the probe', async () => {
    const breaker = new CircuitBreaker(1, 10_000)
    breaker.recordFailure('conn-1')
    expect(breaker.isOpen('conn-1')).toBe(true)
    const listInvoices = vi.fn(async () => [{ id: 'inv-1' }])
    const adapter = {
      platform: 'fortnox', version: '1',
      async refreshCredentials(c: unknown) { return c },
      getAuthUrl: () => '', async exchangeCode() { return { accessToken: 'x' } },
      listInvoices,
    }
    const credStore = new FakeCredentialStore()
    credStore.seed('conn-1', 'fortnox', 'accounting')
    const worker = new SyncWorker<typeof adapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: { async ensureFresh(_a, c) { return c as { accessToken: string } } },
      listableResources: [{ resourceType: 'invoices', method: 'listInvoices' }],
      config: { pollIntervalMs: 50 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const job = await syncStore.create('accounting', 'conn-1', 'fortnox', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    const row = (await syncStore.get(job.id))!
    expect(row.status).toBe('failed')
    expect(row.error).toMatch(/Circuit breaker is open/)
    expect(listInvoices).not.toHaveBeenCalled()
  })
})
