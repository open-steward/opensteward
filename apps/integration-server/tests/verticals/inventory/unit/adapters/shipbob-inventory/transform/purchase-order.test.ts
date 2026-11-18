import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawShipBobReceivingOrder,
} from '../../../../../../../src/verticals/inventory/adapters/shipbob-inventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

/**
 * Fixture follows `GET /2026-01/receiving` per ShipBob's OpenAPI document
 * (fetched 2026-09-18). A Warehouse Receiving Order is the closest thing this
 * API has to a purchase order: stock the merchant sends IN to a fulfilment
 * centre. It carries no supplier and no money — no supplier_id, no currency,
 * no cost — which is why those canonical fields stay unset.
 *
 * status enum, 11 values: Awaiting | Processing | Completed | Cancelled |
 * Incomplete | Arrived | PartiallyArrived | PartiallyArrivedAtHub |
 * ArrivedAtHub | ProcessingAtHub | InternalTransfer
 */
function raw(over: Partial<RawShipBobReceivingOrder> = {}): RawShipBobReceivingOrder {
  return {
    id: 1207,
    purchase_order_number: 'PO-4471',
    status: 'Processing',
    expected_arrival_date: '2026-09-25T00:00:00.000Z',
    insert_date: '2026-09-10T14:02:11.000Z',
    last_updated_date: '2026-09-16T09:31:00.000Z',
    fulfillment_center: { id: 8, name: 'Cicero (IL)' },
    inventory_quantities: [
      { inventory_id: 551, sku: 'WK-2026', expected_quantity: 120, received_quantity: 40 },
      { inventory_id: 552, sku: 'MP-2026', expected_quantity: 60 },
    ],
    ...over,
  }
}

describe('shipbob-inventory purchase orders (receiving orders)', () => {
  it('produces canonical output that satisfies the schema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw()))).not.toThrow()
  })

  it('numbers the order from the WRO purchase order number', () => {
    const po = transformPurchaseOrder(raw())
    expect(po.id).toBe('1207')
    expect(po.number).toBe('PO-4471')
  })

  it('points the destination at the receiving fulfilment centre', () => {
    expect(transformPurchaseOrder(raw()).destinationLocationId).toBe('8')
  })

  it('maps ordered and received quantities per line', () => {
    const lines = transformPurchaseOrder(raw()).lines
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ productId: '551', quantityOrdered: 120, quantityReceived: 40 })
    expect(lines[1]!.quantityReceived).toBeUndefined()
  })

  it('drops a line that references no inventory item', () => {
    const po = transformPurchaseOrder(raw({ inventory_quantities: [{ sku: 'ORPHAN', expected_quantity: 5 }] }))
    expect(po.lines).toEqual([])
  })

  /**
   * The full status enum the LIVE API accepts, taken from the `Statuses`
   * filter on `GET /2026-01/receiving` (2026-09-18) and corroborated by a real
   * WRO's `status_history`, which walked through Awaiting Arrival → Partially
   * Arrived At Hub → Arrived At Hub → Processing At Hub → Internal Transfer →
   * Arrived → Processing → Completed.
   *
   * The 2026-01 OpenAPI document lists only six of these eleven. The five it
   * omits were being mapped to `draft`, which reports stock already inside a
   * ShipBob hub as an unsent order.
   */
  it.each([
    // Nothing received yet. ShipBob has no draft state — creating a WRO
    // submits it — so `draft` is deliberately never produced.
    ['Awaiting', 'sent'],
    ['Processing', 'sent'],
    ['Arrived', 'sent'],
    ['ArrivedAtHub', 'sent'],
    ['ProcessingAtHub', 'sent'],
    ['InternalTransfer', 'sent'],
    // Some of the shipment is physically there, some is not.
    ['PartiallyArrived', 'partially_received'],
    ['PartiallyArrivedAtHub', 'partially_received'],
    // Arrived but short against the expected quantities.
    ['Incomplete', 'partially_received'],
    ['Completed', 'received'],
    ['Cancelled', 'cancelled'],
  ] as const)('maps the live %s state to %s', (vendor, canonical) => {
    expect(transformPurchaseOrder(raw({ status: vendor })).status).toBe(canonical)
  })

  it('never reports a WRO as draft', () => {
    // A ShipBob WRO is submitted at creation; there is no composing state for
    // `draft` to mean. Emitting it would imply the merchant had not sent it.
    const statuses = ['Awaiting', 'Processing', 'Arrived', 'ArrivedAtHub', 'ProcessingAtHub',
      'InternalTransfer', 'PartiallyArrived', 'PartiallyArrivedAtHub', 'Incomplete',
      'Completed', 'Cancelled']
    for (const s of statuses) {
      expect(transformPurchaseOrder(raw({ status: s })).status).not.toBe('draft')
    }
  })

  it('reports an unrecognised state as unknown rather than guessing', () => {
    // The canonical enum carries an explicit `unknown` member. Folding a new
    // vendor state into `draft` or `sent` invents a claim about where the
    // stock is; `unknown` says the adapter does not know, and the real value
    // stays on `raw`.
    const po = transformPurchaseOrder(raw({ status: 'SomeStateShipBobAddedLater' }))
    expect(po.status).toBe('unknown')
    expect(po.raw).toMatchObject({ status: 'SomeStateShipBobAddedLater' })
  })

  it('converts the vendor dates to ISO strings and ignores unparseable ones', () => {
    // Live insert_date carries seven fractional digits and a +00:00 offset:
    // "2026-09-12T10:38:18.2496015+00:00".
    const po = transformPurchaseOrder(raw({ insert_date: '2026-09-12T10:38:18.2496015+00:00' }))
    expect(po.expectedAt).toBe('2026-09-25T00:00:00.000Z')
    expect(po.orderedAt).toBe('2026-09-12T10:38:18.249Z')
    expect(transformPurchaseOrder(raw({ expected_arrival_date: 'not a date' })).expectedAt).toBeUndefined()
  })

  it('leaves supplier and money unset rather than inventing them', () => {
    // A ShipBob WRO names no supplier and carries no cost anywhere.
    const po = transformPurchaseOrder(raw())
    expect(po.supplierId).toBe('')
    expect(po.currency).toBeUndefined()
    expect(po.totalAmount).toBeUndefined()
  })

  it('handles a live payload where more was received than expected', () => {
    // Real sandbox WRO 662894: expected 120, received and stowed 240.
    const po = transformPurchaseOrder(
      raw({
        status: 'Completed',
        inventory_quantities: [
          { inventory_id: 16160672, sku: 'DEMO-TEE-WHT-S', expected_quantity: 120, received_quantity: 240, stowed_quantity: 240 },
        ],
      }),
    )
    expect(po.status).toBe('received')
    expect(po.lines[0]).toMatchObject({ quantityOrdered: 120, quantityReceived: 240 })
  })
})

describe('shipbob-inventory purchase orders — receipt date and ShipBob detail', () => {
  /**
   * `status_history` from live WRO 662894 (sandbox, 2026-09-22), newest first.
   * It uses DISPLAY names ("Arrived At Hub") — a different vocabulary from the
   * top-level `status` ("ArrivedAtHub"). `Completed` is the one spelled the
   * same in both.
   */
  const HISTORY = [
    { timestamp: '2026-09-12T14:18:26.3696805Z', id: 2, status: 'Completed' },
    { timestamp: '2026-09-12T14:16:39.1789785Z', id: 1, status: 'Processing' },
    { timestamp: '2026-09-12T14:15:03.1050557Z', id: 5, status: 'Arrived' },
    { timestamp: '2026-09-12T13:44:23.6167642Z', id: 8, status: 'Arrived At Hub' },
    { timestamp: '2026-09-12T10:38:20.3228976Z', id: 0, status: 'Awaiting Arrival' },
  ]

  it('dates the receipt from the Completed entry in its status history', () => {
    const po = transformPurchaseOrder(raw({ status: 'Completed', status_history: HISTORY }))
    expect(po.receivedAt).toBe('2026-09-12T14:18:26.369Z')
  })

  it('leaves receivedAt unset for an order not yet received', () => {
    const awaiting = [{ timestamp: '2026-09-12T06:36:34.4166719Z', id: 0, status: 'Awaiting Arrival' }]
    expect(transformPurchaseOrder(raw({ status: 'Awaiting', status_history: awaiting })).receivedAt).toBeUndefined()
  })

  it('does not date a receipt the order is not in, even if its history once reached Completed', () => {
    // receivedAt describes the order as it stands; a status that no longer
    // maps to `received` must not carry a receipt date.
    expect(transformPurchaseOrder(raw({ status: 'Cancelled', status_history: HISTORY })).receivedAt).toBeUndefined()
  })

  it('keeps the exact ShipBob status, which the canonical enum folds eleven into five', () => {
    const po = transformPurchaseOrder(raw({ status: 'ArrivedAtHub' }))
    expect(po.status).toBe('sent')
    expect(po.metadata['shipbobStatus']).toBe('ArrivedAtHub')
  })

  it('keeps how the shipment is packed', () => {
    const po = transformPurchaseOrder(
      raw({ package_type: 'Package', box_packaging_type: 'MultipleSkuPerBox' }),
    )
    expect(po.metadata).toMatchObject({ packageType: 'Package', boxPackagingType: 'MultipleSkuPerBox' })
  })

  it('omits detail the order does not carry rather than storing empty strings', () => {
    const po = transformPurchaseOrder(raw({ status: null, package_type: null, box_packaging_type: '' }))
    expect(po.metadata).toEqual({})
    expect(() => PurchaseOrderSchema.parse(po)).not.toThrow()
  })
})
