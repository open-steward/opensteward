import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ShipBobInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/index'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  openDb,
  ResourceStore,
  SyncStore,
  SyncWorker,
  CircuitBreaker,
  _resetCursorPager,
  type DbHandle,
  type TokenRefresherLike,
} from '@opensteward/shared'

/**
 * A sync collects every row, across pages, for every route this adapter reads.
 *
 * It did not. Every account with more than 100 of anything was silently
 * truncated to its first page, and the collection marked complete:
 *
 *   /product, /inventory-level/locations   CURSOR routes. The adapter asked
 *       for PageSize <= 100 and dropped `page`, so page 2 was page 1 again.
 *   /receiving   honoured `Page`, but capped `Limit` at 100 while the worker
 *       asked for 500 — so a full page of 100 looked short, and the worker
 *       stopped after it.
 *
 * And the flattened routes (a product is one row per variant, a stock level
 * one row per fulfilment centre) sliced each page to the caller's `limit`,
 * which in a sync discards the rows a page flattened into beyond it.
 *
 * This runs the REAL SyncWorker — production default page size, so its
 * min(500, maxPageSize) and termination logic are the ones that ship — against
 * the real adapter, with only the HTTP client replaced. Sizes are chosen to
 * straddle ShipBob's 100-per-page cap on every route.
 */
const product = (i: number) => ({
  id: 5000 + i,
  name: `Product ${i}`,
  variants: [{ id: 9000 + i, sku: `SKU-${i}`, status: 'Active', inventory: { inventory_id: 7000 + i } }],
})
const level = (i: number) => ({
  inventory_id: 7000 + i,
  sku: `SKU-${i}`,
  locations: [
    { location_id: 80, on_hand_quantity: 1, fulfillable_quantity: 1, committed_quantity: 0 },
    { location_id: 81, on_hand_quantity: 2, fulfillable_quantity: 2, committed_quantity: 0 },
  ],
})
const wro = (i: number) => ({
  id: 600000 + i,
  purchase_order_number: `PO-${i}`,
  status: 'Awaiting',
  fulfillment_center: { id: 80, name: 'US (CA) West Hub 1' },
  inventory_quantities: [{ inventory_id: 7000 + i, sku: `SKU-${i}`, expected_quantity: 1, received_quantity: 0 }],
})
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, k) => from + k)

const PRODUCTS = range(0, 130).map(product) // 100 + 30
const LEVELS = range(0, 110).map(level) //     100 + 10 items → 220 rows
const WROS = range(0, 105).map(wro) //         100 + 5

/** ShipBob's real `next` shape: relative, unversioned, route casing of its own. */
function routes(path: string, params: Record<string, unknown> = {}): unknown {
  switch (path) {
    case '/product':
      return params['cursor'] === 'P2'
        ? { items: PRODUCTS.slice(100), next: null }
        : { items: PRODUCTS.slice(0, 100), next: '/Product?cursor=P2' }
    case '/inventory-level/locations':
      return params['cursor'] === 'S2'
        ? { items: LEVELS.slice(100), next: null }
        : { items: LEVELS.slice(0, 100), next: '/inventory-level?cursor=S2' }
    case '/receiving': {
      const page = Number(params['Page'] ?? 1)
      const limit = Number(params['Limit'])
      return WROS.slice((page - 1) * limit, page * limit)
    }
    case '/fulfillment-center':
      return [
        { id: 80, name: 'US (CA) West Hub 1', country: 'US' },
        { id: 81, name: 'US (IL) Midwest Hub 1', country: 'US' },
      ]
    default:
      throw new Error(`sync-paging.test: no route for ${path}`)
  }
}

vi.mock(
  '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/client',
  () => ({
    ShipBobInventoryClient: class {
      async get(path: string, params?: Record<string, unknown>) {
        return routes(path, params)
      }
      async post() {
        return null
      }
    },
  }),
)

class FakeCredentialStore {
  private row = {
    id: 'conn-1', vertical: 'inventory', platform: 'shipbob-inventory', tenantId: null,
    ownerTenantId: null, label: null, expiresAt: null, createdAt: 0, updatedAt: 0,
  }
  loadById(id: string) { return id === 'conn-1' ? { accessToken: 'tok' } : null }
  getRow(id: string) { return id === 'conn-1' ? this.row : null }
  updateById() { /* no-op */ }
}

describe('shipbob-inventory sync collects every page', () => {
  let dir: string
  let handle: DbHandle
  let resourceStore: ResourceStore
  let syncStore: SyncStore

  beforeEach(async () => {
    _resetCursorPager()
    dir = mkdtempSync(join(tmpdir(), 'os-sbpage-'))
    handle = await openDb({ sqlitePath: join(dir, 'r.db') })
    resourceStore = await ResourceStore.create(handle)
    syncStore = await SyncStore.create(resourceStore.getHandle())
  })
  afterEach(async () => {
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  async function sync() {
    const adapter = new ShipBobInventoryAdapter()
    const refresher: TokenRefresherLike<typeof adapter> = {
      async ensureFresh(_a, c) { return c as { accessToken: string } },
    }
    const worker = new SyncWorker<typeof adapter>({
      vertical: 'inventory',
      syncStore,
      credentialStore: new FakeCredentialStore() as never,
      registry: { get: () => adapter } as never,
      circuitBreaker: new CircuitBreaker(),
      resourceStore,
      tokenRefresher: refresher,
      listableResources: [
        { resourceType: 'products', method: 'listProducts' },
        { resourceType: 'stock-levels', method: 'listStockLevels' },
        { resourceType: 'purchase-orders', method: 'listPurchaseOrders' },
        { resourceType: 'locations', method: 'listLocations' },
      ],
      // No pageSize: the production default, so min(default, maxPageSize) is
      // the value that ships. A small page cap keeps a regression from looping.
      config: { pollIntervalMs: 50, maxPagesPerResource: 10 },
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    })
    const job = await syncStore.create('inventory', 'conn-1', 'shipbob-inventory', null, null)
    await (
      worker as unknown as { processJob: (j: unknown, s: AbortSignal) => Promise<void> }
    ).processJob(job, new AbortController().signal)
    const count = async (type: string) =>
      (await resourceStore.list('inventory', 'shipbob-inventory', 'conn-1', type)).length
    return {
      job: (await syncStore.get(job.id))!,
      products: await count('products'),
      stockLevels: await count('stock-levels'),
      purchaseOrders: await count('purchase-orders'),
      locations: await count('locations'),
    }
  }

  it('completes the job', async () => {
    const { job } = await sync()
    expect(job.error).toBeNull()
    expect(job.status).toBe('completed')
  })

  it('follows the product cursor past the first 100', async () => {
    expect((await sync()).products).toBe(130)
  })

  it('follows the stock-level cursor, and keeps every row a page flattens into', async () => {
    // 110 inventory items × 2 fulfilment centres. The first page alone is 200
    // rows — twice the page size — and none of them may be trimmed.
    expect((await sync()).stockLevels).toBe(220)
  })

  it('reads receiving orders past a full first page of 100', async () => {
    expect((await sync()).purchaseOrders).toBe(105)
  })

  it('still reads the unpaged location route once', async () => {
    expect((await sync()).locations).toBe(2)
  })
})
