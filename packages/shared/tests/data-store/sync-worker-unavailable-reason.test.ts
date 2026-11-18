/**
 * A resource the adapter has no list method for is 'skipped' before any
 * request. Without a reason the sync report shows only that word, and the
 * operator cannot tell "the platform has no such thing" from "not built yet".
 * `unavailableReason` lets the host answer from the adapter's declaration; the
 * reason lands in the resource's progress `error`, which the admin sync-job
 * page already renders under each resource.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'
import { SyncWorker, type SyncWorkerOptions } from '../../src/data-store/sync-worker'
import { CircuitBreaker } from '../../src/circuit-breaker'

class FakeCredentialStore {
  loadById() {
    return { accessToken: 'seed-token' }
  }
  getRow(id: string) {
    const now = Date.now()
    return {
      id,
      vertical: 'accounting',
      platform: 'acme',
      tenantId: null,
      ownerTenantId: null,
      label: null,
      expiresAt: null,
      createdAt: now,
      updatedAt: now,
    }
  }
  updateById() {
    /* no-op */
  }
}

describe('a skipped resource carries the declared reason the platform lacks it', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-swur-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const adapter = {
    platform: 'acme',
    version: '1',
    async refreshCredentials(c: unknown) {
      return c
    },
    getAuthUrl: () => '',
    async exchangeCode() {
      return { accessToken: 'x' }
    },
    listInvoices: async () => [{ id: 'i-1' }],
  }

  async function run(unavailableReason?: SyncWorkerOptions<typeof adapter>['unavailableReason']) {
    const worker = new SyncWorker<typeof adapter>({
      vertical: 'accounting',
      syncStore,
      credentialStore: new FakeCredentialStore() as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(5, 30_000),
      resourceStore,
      tokenRefresher: {
        async ensureFresh(_a, c) {
          return c as { accessToken: string }
        },
      },
      listableResources: [
        { resourceType: 'invoices', method: 'listInvoices' },
        { resourceType: 'taxrates', method: 'listTaxRates' },
        { resourceType: 'orders', method: 'listOrders' },
      ],
      config: { pollIntervalMs: 50, pageSize: 10 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      ...(unavailableReason ? { unavailableReason } : {}),
    })
    const job = await syncStore.create('accounting', 'conn-1', 'acme', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return (await syncStore.get(job.id))!
  }

  it('puts the reason on each skipped resource the resolver knows, and only asks about those', async () => {
    const resolver = vi.fn(async (_platform: string, r: { method: string }) =>
      r.method === 'listTaxRates' ? 'VAT exists only per line' : undefined,
    )
    const job = await run(resolver)
    expect(job.progress).toEqual({
      invoices: { synced: 1, status: 'completed' },
      taxrates: {
        synced: 0,
        status: 'skipped',
        error: 'Not provided by acme: VAT exists only per line',
      },
      // no declaration: the bare skip, as before
      orders: { synced: 0, status: 'skipped' },
    })
    expect(job.status).toBe('completed')
    expect(resolver.mock.calls.map(([p, r]) => [p, r.method])).toEqual([
      ['acme', 'listTaxRates'],
      ['acme', 'listOrders'],
    ])
  })

  it('keeps the bare skip and completes the job when the resolver throws', async () => {
    const job = await run(() => {
      throw new Error('unreadable declaration')
    })
    expect(job.progress?.taxrates).toEqual({ synced: 0, status: 'skipped' })
    expect(job.status).toBe('completed')
  })

  it('is unchanged without a resolver', async () => {
    const job = await run()
    expect(job.progress?.taxrates).toEqual({ synced: 0, status: 'skipped' })
  })
})
