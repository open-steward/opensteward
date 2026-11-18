/**
 * A list method that refuses before sending anything — `statusCode: 501,
 * code: 'NOT_SUPPORTED'`, the pattern `maxPageSize` in AdapterCapabilities
 * documents for a platform that cannot list a resource — is not a failure of
 * the platform, nor of the sync.
 *
 * Before, the worker treated it like any throw: the resource was marked
 * 'failed', the whole job ended 'failed' ("One or more resource types failed to
 * sync") on every run, one-time Connect Links were never disposed (their hook
 * only fires on 'completed'), and each refusal charged the circuit breaker
 * although no request was made. On JD.com, five such throws in a row
 * (products, variants, inventory levels, orders, fulfillments) opened the
 * breaker, and refunds — its one working list — then failed with "Circuit
 * breaker opened during sync".
 *
 * Now the resource is 'skipped' with the refusal as its reason, the breaker is
 * not touched, and the job's status is decided by the resources that can sync.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { ResourceStore } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'
import { SyncWorker } from '../../src/data-store/sync-worker'
import { CircuitBreaker } from '../../src/circuit-breaker'

class FakeCredentialStore {
  private rows = new Map<string, Record<string, unknown>>()
  seed(id: string, platform: string, vertical: string): void {
    const now = Date.now()
    this.rows.set(id, {
      id,
      vertical,
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

type ListFn = (
  creds: unknown,
  params: { page: number; limit: number },
) => Promise<Array<{ id: string }>>

function refusal(resource: string): Error {
  return Object.assign(new Error(`Acme cannot list ${resource}: no documented list`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

describe('a list the adapter refuses (501 NOT_SUPPORTED) is skipped, not failed', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'oi-swns-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(
    lists: Record<string, ListFn>,
    breaker: CircuitBreaker,
    onJobComplete?: (job: unknown, status: 'completed' | 'failed') => Promise<void>,
  ) {
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
      ...lists,
    }
    const credStore = new FakeCredentialStore()
    credStore.seed('conn-1', 'acme', 'ecommerce')
    const worker = new SyncWorker<typeof adapter>({
      vertical: 'ecommerce',
      syncStore,
      credentialStore: credStore as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: breaker,
      resourceStore,
      tokenRefresher: {
        async ensureFresh(_a, c) {
          return c as { accessToken: string }
        },
      },
      listableResources: Object.keys(lists).map((method) => ({
        resourceType: method.replace(/^list/, '').toLowerCase(),
        method,
      })),
      config: { pollIntervalMs: 50, pageSize: 10 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      ...(onJobComplete ? { onJobComplete } : {}),
    })
    const job = await syncStore.create('ecommerce', 'conn-1', 'acme', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    return (await syncStore.get(job.id))!
  }

  it('marks the refused resource skipped with its reason, and the job completes', async () => {
    const onJobComplete = vi.fn(async () => {})
    const job = await run(
      {
        listProducts: async () => {
          throw refusal('products')
        },
        listOrders: async () => [{ id: 'o-1' }],
      },
      new CircuitBreaker(5, 30_000),
      onJobComplete,
    )
    expect(job.progress?.products).toMatchObject({
      status: 'skipped',
      synced: 0,
      error: expect.stringMatching(/Acme cannot list products/),
    })
    expect(job.progress?.orders).toMatchObject({ status: 'completed', synced: 1 })
    expect(job.status).toBe('completed')
    // The one-time-link cleanup hook sees a completed job.
    expect(onJobComplete).toHaveBeenCalledWith(expect.anything(), 'completed')
  })

  it('drops a completeness marker a refused collection still carried', async () => {
    // Written when the list still "worked"; the platform cannot list it now,
    // so nothing may serve the cached rows as the whole collection.
    await resourceStore.markCollectionComplete('ecommerce', 'acme', 'conn-1', 'products')
    await run(
      {
        listProducts: async () => {
          throw refusal('products')
        },
      },
      new CircuitBreaker(5, 30_000),
    )
    expect(
      await resourceStore.collectionCompletedAt('ecommerce', 'acme', 'conn-1', 'products'),
    ).toBeNull()
  })

  it('never charges the circuit breaker: no request was made', async () => {
    const breaker = new CircuitBreaker(1, 30_000)
    await run(
      {
        listProducts: async () => {
          throw refusal('products')
        },
      },
      breaker,
    )
    expect(breaker.isOpen('conn-1')).toBe(false)
  })

  it('five refusals in a row leave the next list to sync (JD.com: refunds after five)', async () => {
    const listRefunds = vi.fn(async () => [{ id: 'r-1' }])
    const job = await run(
      {
        listProducts: async () => {
          throw refusal('products')
        },
        listVariants: async () => {
          throw refusal('variants')
        },
        listInventory: async () => {
          throw refusal('inventory')
        },
        listOrders: async () => {
          throw refusal('orders')
        },
        listFulfillments: async () => {
          throw refusal('fulfillments')
        },
        listRefunds,
      },
      new CircuitBreaker(5, 30_000),
    )
    expect(listRefunds).toHaveBeenCalled()
    expect(job.progress?.refunds).toMatchObject({ status: 'completed', synced: 1 })
    expect(job.status).toBe('completed')
  })

  it('a real failure still fails the job and charges the breaker', async () => {
    const breaker = new CircuitBreaker(1, 30_000)
    const job = await run(
      {
        listProducts: async () => {
          throw refusal('products')
        },
        listOrders: async () => {
          throw Object.assign(new Error('upstream 503'), { statusCode: 503 })
        },
      },
      breaker,
    )
    expect(job.progress?.products).toMatchObject({ status: 'skipped' })
    expect(job.progress?.orders).toMatchObject({ status: 'failed' })
    expect(job.status).toBe('failed')
    expect(breaker.isOpen('conn-1')).toBe(true)
  })

  it('a 501 without the NOT_SUPPORTED code is an ordinary failure', async () => {
    const job = await run(
      {
        listProducts: async () => {
          throw Object.assign(new Error('Not Implemented'), { statusCode: 501 })
        },
      },
      new CircuitBreaker(5, 30_000),
    )
    expect(job.progress?.products).toMatchObject({ status: 'failed' })
    expect(job.status).toBe('failed')
  })

  it('NOT_SUPPORTED on anything but a 501 is an ordinary failure too', async () => {
    const job = await run(
      {
        listProducts: async () => {
          throw Object.assign(new Error('upstream said NOT_SUPPORTED'), {
            statusCode: 502,
            code: 'NOT_SUPPORTED',
          })
        },
      },
      new CircuitBreaker(5, 30_000),
    )
    expect(job.progress?.products).toMatchObject({ status: 'failed' })
    expect(job.status).toBe('failed')
  })

  it('a refusal after rows were written is a failure: the collection is part-synced', async () => {
    const full = Array.from({ length: 10 }, (_, i) => ({ id: `p-${i + 1}` }))
    const job = await run(
      {
        listProducts: async (_c, params) => {
          if (params.page === 1) return full
          throw refusal('products past page 1')
        },
      },
      new CircuitBreaker(5, 30_000),
    )
    expect(job.progress?.products).toMatchObject({ status: 'failed', synced: 10 })
    expect(job.status).toBe('failed')
  })
})
