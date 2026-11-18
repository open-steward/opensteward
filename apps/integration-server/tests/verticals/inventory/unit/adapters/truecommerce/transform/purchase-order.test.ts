import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawTruecommercePurchaseOrder,
  type RawTruecommercePurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/truecommerce/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLine(
  overrides: Partial<RawTruecommercePurchaseOrderLine> = {},
): RawTruecommercePurchaseOrderLine {
  return {
    item_id: 'item_001',
    qty_ordered: 200,
    qty_received: 100,
    unit_cost: 2500, // already in minor units (cents)
    line_total: 500000, // already in minor units (cents)
    ...overrides,
  }
}

function makeRaw(
  overrides: Partial<RawTruecommercePurchaseOrder> = {},
): RawTruecommercePurchaseOrder {
  return {
    po_id: 'po_001',
    po_number: 'PO-1042',
    supplier_id: 'sup_001',
    status: 'sent',
    currency: 'USD',
    subtotal_amount: 490000, // already in minor units
    total_amount: 500000, // already in minor units
    destination_location_id: 'loc_001',
    line_items: [makeLine()],
    ordered_date: '2024-03-01T00:00:00Z',
    expected_delivery_date: '2024-03-15T00:00:00Z',
    received_date: '2024-03-16T00:00:00Z',
    ...overrides,
  }
}

// ─── transformPurchaseOrder ───────────────────────────────────────────────────

describe('transformPurchaseOrder', () => {
  it('maps id and externalId from po_id', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('po_001')
    expect(result.externalId).toBe('po_001')
  })

  it('maps number from po_number', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.number).toBe('PO-1042')
  })

  it('maps supplierId from supplier_id', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.supplierId).toBe('sup_001')
  })

  it('maps destinationLocationId from destination_location_id', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.destinationLocationId).toBe('loc_001')
  })

  it('passes subtotalAmount and totalAmount through as minor units (no conversion)', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.subtotalAmount).toBe(490000)
    expect(result.totalAmount).toBe(500000)
  })

  it('maps line item productId, quantityOrdered, quantityReceived', () => {
    const result = transformPurchaseOrder(makeRaw())
    const line = result.lines[0]
    expect(line?.productId).toBe('item_001')
    expect(line?.quantityOrdered).toBe(200)
    expect(line?.quantityReceived).toBe(100)
  })

  it('passes line unitCost and lineTotal through as minor units', () => {
    const result = transformPurchaseOrder(makeRaw())
    const line = result.lines[0]
    expect(line?.unitCost).toBe(2500)
    expect(line?.lineTotal).toBe(500000)
  })

  it('maps orderedAt, expectedAt, receivedAt to ISO strings', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-16T00:00:00.000Z')
  })

  it('hardcodes platform to "truecommerce"', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.platform).toBe('truecommerce')
  })

  it('returns empty lines array when line_items is absent', () => {
    const result = transformPurchaseOrder(makeRaw({ line_items: undefined }))
    expect(result.lines).toEqual([])
  })

  describe('mapStatus', () => {
    const cases: [string, string][] = [
      ['draft', 'draft'],
      ['sent', 'sent'],
      ['ordered', 'sent'],
      ['submitted', 'sent'],
      ['partially_received', 'partially_received'],
      ['partially received', 'partially_received'],
      ['received', 'received'],
      ['closed', 'closed'],
      ['completed', 'closed'],
      ['cancelled', 'cancelled'],
      ['voided', 'cancelled'],
      ['unknown_status', 'draft'], // default fallback
    ]

    for (const [rawStatus, expected] of cases) {
      it(`maps status "${rawStatus}" → "${expected}"`, () => {
        const result = transformPurchaseOrder(makeRaw({ status: rawStatus }))
        expect(result.status).toBe(expected)
      })
    }

    it('defaults to "draft" when status is absent', () => {
      const result = transformPurchaseOrder(makeRaw({ status: undefined }))
      expect(result.status).toBe('draft')
    })
  })

  it('passes PurchaseOrderSchema.parse without throwing', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
