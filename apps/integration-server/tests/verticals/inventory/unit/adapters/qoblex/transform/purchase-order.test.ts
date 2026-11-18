import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawQoblexPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/qoblex/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('qoblex transformPurchaseOrder', () => {
  const raw: RawQoblexPurchaseOrder = {
    id: 500,
    number: 'PO-500',
    type: 'standard',
    created_at: '2024-03-01T00:00:00Z',
    last_updated_at: '2024-03-02T00:00:00Z',
    due_date: '2024-03-15T00:00:00Z',
    status: 'approved',
    billing_status: 'billed',
    receiving_status: 'not_received',
    payment_status: 'unpaid',
    supplier_id: 55,
    ship_to_location_id: 42,
    currency: 'USD',
    currency_exchange_rate: 1.0,
    is_tax_inclusive: false,
    line_items: [
      {
        id: 1,
        name: 'Wireless Keyboard - Black',
        product_variant: { id: 101, name: 'WK Black', sku: 'WK-2026-BLK' },
        quantity: 100,
        price: 49.99,
        discount: 0,
        received_quantity: 0,
        is_fully_received: false,
      },
    ],
  }

  it('stringifies numeric id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('500')
    expect(result.externalId).toBe('500')
  })

  it('maps supplierId and destinationLocationId', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('55')
    expect(result.destinationLocationId).toBe('42')
  })

  it('maps approved + not_received to "sent"', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps approved + partially_received to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, receiving_status: 'partially_received' })
    expect(result.status).toBe('partially_received')
  })

  it('maps approved + received to received', () => {
    const result = transformPurchaseOrder({ ...raw, receiving_status: 'received' })
    expect(result.status).toBe('received')
  })

  it('maps draft status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'draft' })
    expect(result.status).toBe('draft')
  })

  it('maps closed status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'closed' })
    expect(result.status).toBe('closed')
  })

  it('maps cancelled status', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })

  it('maps line items with productId and quantityOrdered', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.unitCost).toBe(49.99)
    expect(result.lines[0]!.quantityReceived).toBe(0)
  })

  it('maps orderedAt from created_at and expectedAt from due_date', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
