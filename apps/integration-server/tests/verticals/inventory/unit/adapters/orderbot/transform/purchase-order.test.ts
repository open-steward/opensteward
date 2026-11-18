import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawOrderbotPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/orderbot/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — orderbot', () => {
  const raw: RawOrderbotPurchaseOrder = {
    id: 42,
    number: 'PO-2024-042',
    supplier_id: 7,
    destination_location_id: 3,
    status: 'sent',
    currency: 'USD',
    subtotal: 490.0,
    total: 500.0,
    lines: [
      {
        product_id: 123,
        quantity_ordered: 10,
        quantity_received: 5,
        unit_cost: 49.0,
        line_total: 490.0,
      },
    ],
    expected_delivery_date: '2024-03-01T00:00:00Z',
    ordered_at: '2024-03-01T00:00:00Z',
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('42')
  })

  it('maps number from raw.number', () => {
    expect(result.number).toBe('PO-2024-042')
  })

  it('maps supplierId from supplier_id as string', () => {
    expect(result.supplierId).toBe('7')
  })

  it('maps destinationLocationId from destination_location_id as string', () => {
    expect(result.destinationLocationId).toBe('3')
  })

  it('maps status: sent from "sent"', () => {
    expect(result.status).toBe('sent')
  })

  it('maps currency', () => {
    expect(result.currency).toBe('USD')
  })

  it('maps totalAmount from total', () => {
    expect(result.totalAmount).toBe(500.0)
  })

  it('maps lines with productId, quantityOrdered, unitCost, lineTotal', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('123')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    expect(result.lines[0]!.quantityReceived).toBe(5)
    expect(result.lines[0]!.unitCost).toBe(49.0)
  })

  it('maps expectedAt via toIso', () => {
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to orderbot', () => {
    expect(result.platform).toBe('orderbot')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — orderbot status mapping', () => {
  const cases: Array<[string, string]> = [
    ['draft', 'draft'],
    ['approved', 'sent'],
    ['partially_received', 'partially_received'],
    ['received', 'received'],
    ['closed', 'closed'],
    ['cancelled', 'cancelled'],
  ]

  for (const [input, expected] of cases) {
    it(`maps status "${input}" → "${expected}"`, () => {
      const raw: RawOrderbotPurchaseOrder = { id: 1, supplier_id: 1, status: input, lines: [] }
      const result = transformPurchaseOrder(raw)
      expect(result.status).toBe(expected)
    })
  }
})

describe('transformPurchaseOrder — orderbot line_items fallback', () => {
  const raw: RawOrderbotPurchaseOrder = {
    id: 99,
    supplier: 'ACME Corp',
    status: 'draft',
    line_items: [{ sku: 'SKU-A', quantity_ordered: 5 }],
  }
  const result = transformPurchaseOrder(raw)

  it('falls back to line_items when lines absent', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-A')
  })

  it('uses supplier string as supplierId fallback', () => {
    expect(result.supplierId).toBe('ACME Corp')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
