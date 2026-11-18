import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawEZOPurchaseOrder,
  type RawEZOPurchaseOrderLine,
} from '../../../../../../../src/verticals/inventory/adapters/ezofficeinventory/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — ezofficeinventory', () => {
  const lines: RawEZOPurchaseOrderLine[] = [
    {
      id: 1,
      item_id: 55,
      item_type: 'Inventory',
      quantity: 10,
      unit_price: '5.00',
      total: '50.00',
    },
  ]
  const raw: RawEZOPurchaseOrder = {
    id: 77,
    identification_number: 'PO-2024-001',
    vendor_id: 99,
    delivery_location_id: 11,
    state: 'confirmed',
    net_amount: '50.00',
    payable_amount: '55.00',
    line_items: lines,
    confirmed_at: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-01T00:00:00Z',
  }
  const result = transformPurchaseOrder(raw)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('77')
  })

  it('maps number from identification_number', () => {
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendor_id as string', () => {
    expect(result.supplierId).toBe('99')
  })

  it('maps state "confirmed" to status "sent"', () => {
    expect(result.status).toBe('sent')
  })

  it('converts net_amount to subtotalAmount in minor units', () => {
    expect(result.subtotalAmount).toBe(5000)
  })

  it('converts payable_amount to totalAmount in minor units', () => {
    expect(result.totalAmount).toBe(5500)
  })

  it('maps line productId from item_id as string', () => {
    expect(result.lines[0]?.productId).toBe('55')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(10)
  })

  it('converts line unit_price to minor units', () => {
    expect(result.lines[0]?.unitCost).toBe(500)
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — ezofficeinventory status mapping', () => {
  const base: RawEZOPurchaseOrder = { id: 1, vendor_id: '1', line_items: [] }

  it.each([
    ['draft', 'draft'],
    ['requested', 'draft'],
    ['approved', 'draft'],
    ['partially_received', 'partially_received'],
    ['received', 'received'],
    ['completed', 'received'],
    ['closed', 'closed'],
    ['voided', 'cancelled'],
    ['canceled', 'cancelled'],
  ] as const)('maps state "%s" to status "%s"', (state, expected) => {
    const result = transformPurchaseOrder({ ...base, state })
    expect(result.status).toBe(expected)
  })
})
