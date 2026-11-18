import { describe, it, expect, vi } from 'vitest'
import { ShipBobInventoryAdapter } from '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/index'
import type { Credentials } from '@opensteward/shared'

/**
 * Every reference one resource makes to another resolves to a row this same
 * adapter emits.
 *
 * This is the test that would have caught the defect it pins. On a real sync
 * (2026-09-22) every one of 147 rows passed its canonical schema, yet 0 of 84
 * stock levels and 0 of 76 purchase-order lines resolved to a product:
 * `product.id` was ShipBob's PRODUCT id while both of those reference its
 * INVENTORY id. Per-transform tests cannot see that — each transform was
 * individually correct about its own shape — so this runs all four list
 * methods over one connected set of payloads and joins them.
 *
 * The payloads are real: one live sandbox receiving order (WRO 662892) and the
 * three inventory items it references, the products that own them, and the
 * fulfilment centres involved — captured 2026-09-22 and trimmed to the fields
 * the transforms read. Stock levels keep two of each item's 6–7 location rows.
 */
const PRODUCTS = [
  { id: 10343409, name: 'Classic Tee - Black / Large', variants: [{ id: 23403750, name: 'Classic Tee - Black / Large', sku: 'DEMO-TEE-BLK-L', status: 'Active', inventory: { inventory_id: 16160677, on_hand_qty: 295 } }] },
  { id: 10343407, name: 'Classic Tee - Black / Medium', variants: [{ id: 23403748, name: 'Classic Tee - Black / Medium', sku: 'DEMO-TEE-BLK-M', status: 'Active', inventory: { inventory_id: 16160675, on_hand_qty: 357 } }] },
  { id: 10343405, name: 'Classic Tee - Black / Small', variants: [{ id: 23403746, name: 'Classic Tee - Black / Small', sku: 'DEMO-TEE-BLK-S', status: 'Active', inventory: { inventory_id: 16160673, on_hand_qty: 238 } }] },
]

const INVENTORY_LEVELS = [
  { inventory_id: 16160673, name: 'Classic Tee - Black / Small', sku: 'DEMO-TEE-BLK-S', locations: [
    { location_id: 80, name: 'US (CA) West Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 120, internal_transfer_quantity: 0 },
    { location_id: 81, name: 'US (IL) Midwest Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 82, internal_transfer_quantity: 0 },
  ] },
  { inventory_id: 16160675, name: 'Classic Tee - Black / Medium', sku: 'DEMO-TEE-BLK-M', locations: [
    { location_id: 80, name: 'US (CA) West Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 64, internal_transfer_quantity: 0 },
    { location_id: 81, name: 'US (IL) Midwest Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 116, internal_transfer_quantity: 0 },
  ] },
  { inventory_id: 16160677, name: 'Classic Tee - Black / Large', sku: 'DEMO-TEE-BLK-L', locations: [
    { location_id: 80, name: 'US (CA) West Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 114, internal_transfer_quantity: 0 },
    { location_id: 81, name: 'US (IL) Midwest Hub 1', fulfillable_quantity: 0, on_hand_quantity: 0, committed_quantity: 0, awaiting_quantity: 144, internal_transfer_quantity: 0 },
  ] },
]

const RECEIVING_ORDERS = [
  {
    id: 662892,
    purchase_order_number: 'PO-DEMO-KV5PTG-16',
    status: 'Awaiting',
    insert_date: '2026-09-12T06:36:33.9015443+00:00',
    expected_arrival_date: '2026-09-20T00:00:00+00:00',
    fulfillment_center: { id: 81, name: 'US (IL) Midwest Hub 1' },
    inventory_quantities: [
      { inventory_id: 16160673, sku: 'DEMO-TEE-BLK-S', expected_quantity: 48, received_quantity: 0, stowed_quantity: 0 },
      { inventory_id: 16160675, sku: 'DEMO-TEE-BLK-M', expected_quantity: 23, received_quantity: 0, stowed_quantity: 0 },
      { inventory_id: 16160677, sku: 'DEMO-TEE-BLK-L', expected_quantity: 50, received_quantity: 0, stowed_quantity: 0 },
    ],
    status_history: [{ timestamp: '2026-09-12T06:36:34.4166719Z', id: 0, status: 'Awaiting Arrival' }],
  },
]

const FULFILLMENT_CENTERS = [
  { id: 80, name: 'US (CA) West Hub 1', address1: '28010 Eucalyptus Ave', city: 'Moreno Valley', state: 'CA', country: 'US', zip_code: '92555' },
  { id: 81, name: 'US (IL) Midwest Hub 1', address1: '400 Smoke Tree Plaza', city: 'North Aurora', state: 'IL', country: 'US', zip_code: '60542' },
]

const RESPONSES: Record<string, unknown> = {
  '/product': { items: PRODUCTS },
  '/inventory-level/locations': { items: INVENTORY_LEVELS },
  '/receiving': RECEIVING_ORDERS,
  '/fulfillment-center': FULFILLMENT_CENTERS,
}

vi.mock(
  '../../../../../../src/verticals/inventory/adapters/shipbob-inventory/client',
  () => ({
    ShipBobInventoryClient: class {
      async get(path: string) {
        if (!(path in RESPONSES)) throw new Error(`references.test: no fixture for ${path}`)
        return RESPONSES[path]
      }
      async post() {
        return null
      }
    },
  }),
)

const creds = { accessToken: 'tok' } as Credentials

async function syncAll() {
  const a = new ShipBobInventoryAdapter()
  const [products, stockLevels, locations, purchaseOrders] = await Promise.all([
    a.listProducts(creds, {}),
    a.listStockLevels(creds, {}),
    a.listLocations(creds, {}),
    a.listPurchaseOrders(creds, {}),
  ])
  return { products, stockLevels, locations, purchaseOrders }
}

describe('shipbob-inventory cross-resource references', () => {
  it('has something to join — an empty set would pass every check below vacuously', async () => {
    const { products, stockLevels, locations, purchaseOrders } = await syncAll()
    expect(products.length).toBeGreaterThan(0)
    expect(stockLevels.length).toBeGreaterThan(0)
    expect(locations.length).toBeGreaterThan(0)
    expect(purchaseOrders.flatMap((o) => o.lines).length).toBeGreaterThan(0)
  })

  it('resolves every stock level to a product', async () => {
    const { products, stockLevels } = await syncAll()
    const ids = new Set(products.map((p) => p.id))
    expect(stockLevels.filter((s) => !ids.has(s.productId)).map((s) => s.productId)).toEqual([])
  })

  it('resolves every purchase-order line to a product', async () => {
    const { products, purchaseOrders } = await syncAll()
    const ids = new Set(products.map((p) => p.id))
    const lines = purchaseOrders.flatMap((o) => o.lines)
    expect(lines.filter((l) => !ids.has(l.productId)).map((l) => l.productId)).toEqual([])
  })

  it('resolves every stock level to a location', async () => {
    const { locations, stockLevels } = await syncAll()
    const ids = new Set(locations.map((l) => l.id))
    expect(stockLevels.filter((s) => !ids.has(s.locationId)).map((s) => s.locationId)).toEqual([])
  })

  it('resolves every purchase order to its destination location', async () => {
    const { locations, purchaseOrders } = await syncAll()
    const ids = new Set(locations.map((l) => l.id))
    const dangling = purchaseOrders
      .filter((o) => o.destinationLocationId && !ids.has(o.destinationLocationId))
      .map((o) => o.destinationLocationId)
    expect(dangling).toEqual([])
  })
})
