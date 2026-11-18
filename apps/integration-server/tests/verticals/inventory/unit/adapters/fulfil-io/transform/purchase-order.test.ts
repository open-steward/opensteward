import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawFulfilPurchaseOrder,
  type RawFulfilPurchaseLine,
} from '../../../../../../../src/verticals/inventory/adapters/fulfil-io/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — fulfil-io with explicit lines', () => {
  const raw: RawFulfilPurchaseOrder = {
    id: 100,
    number: 'PO-2024-100',
    party: [20, 'Acme Supplier'],
    state: 'confirmed',
    currency: [2, 'USD'],
    untaxed_amount: 500,
    total_amount: 550,
    warehouse: [3, 'Main Warehouse'],
    purchase_date: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-01T00:00:00Z',
  }
  const lines: RawFulfilPurchaseLine[] = [
    {
      id: 1,
      product: [55, 'Widget'],
      quantity: 10,
      received_quantity: 5,
      unit_price: 50,
      amount: 500,
    },
  ]
  const result = transformPurchaseOrder(raw, lines)

  it('maps id from raw.id as string', () => {
    expect(result.id).toBe('100')
  })

  it('maps number from raw.number', () => {
    expect(result.number).toBe('PO-2024-100')
  })

  it('maps supplierId from party m2o id', () => {
    expect(result.supplierId).toBe('20')
  })

  it('maps state "confirmed" to status "sent"', () => {
    expect(result.status).toBe('sent')
  })

  it('maps currency from currency m2o name', () => {
    expect(result.currency).toBe('USD')
  })

  it('maps subtotalAmount from untaxed_amount', () => {
    expect(result.subtotalAmount).toBe(500)
  })

  it('maps totalAmount from total_amount', () => {
    expect(result.totalAmount).toBe(550)
  })

  it('maps destinationLocationId from warehouse m2o id', () => {
    expect(result.destinationLocationId).toBe('3')
  })

  it('maps line productId from product m2o id', () => {
    expect(result.lines[0]?.productId).toBe('55')
  })

  it('maps line quantityOrdered', () => {
    expect(result.lines[0]?.quantityOrdered).toBe(10)
  })

  it('maps line quantityReceived', () => {
    expect(result.lines[0]?.quantityReceived).toBe(5)
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — fulfil-io inline lines', () => {
  const lines: RawFulfilPurchaseLine[] = [{ id: 2, product: [56, 'Gadget'], quantity: 20 }]
  const raw: RawFulfilPurchaseOrder = {
    id: 101,
    party: [21, 'Beta Supplier'],
    state: 'draft',
    lines,
  }
  const result = transformPurchaseOrder(raw)

  it('uses inline lines when no explicit lines argument', () => {
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]?.productId).toBe('56')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — fulfil-io status mapping', () => {
  const base: RawFulfilPurchaseOrder = { id: 1, party: [1, 'S'] }

  it.each([
    ['draft', 'draft'],
    ['quotation', 'draft'],
    ['confirmed', 'sent'],
    ['processing', 'sent'],
    ['done', 'closed'],
    ['cancelled', 'cancelled'],
  ] as const)('maps state "%s" to status "%s"', (state, expected) => {
    const result = transformPurchaseOrder({ ...base, state })
    expect(result.status).toBe(expected)
  })
})
