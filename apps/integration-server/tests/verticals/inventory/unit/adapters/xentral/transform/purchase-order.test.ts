import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawXentralPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/xentral/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const rawPO: RawXentralPurchaseOrder = {
  id: 'po-101',
  documentNumber: 'PO-2024-101',
  date: '2024-03-01T00:00:00Z',
  status: 'open',
  supplier: {
    id: 'sup-7',
    name: 'Gadget GmbH',
    number: 'S-007',
  },
  financials: {
    total: { amount: '500.00', currency: 'EUR' },
  },
  delivery: {
    dates: {
      desiredDeliveryDate: '2024-03-15T00:00:00Z',
      confirmedDeliveryDate: '2024-03-16T00:00:00Z',
    },
  },
  positions: [
    {
      id: 'pos-1',
      product: { id: 'prod-99' },
      quantity: 10,
      delivered: 0,
      price: { amount: '50.00', currency: 'EUR' },
    },
  ],
  log: {
    createdAt: '2024-03-01T00:00:00Z',
    isSent: true,
  },
}

describe('xentral transformPurchaseOrder', () => {
  it('maps id to id and externalId', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.id).toBe('po-101')
    expect(result.externalId).toBe('po-101')
  })

  it('maps documentNumber to number', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.number).toBe('PO-2024-101')
  })

  it('maps supplier.id to supplierId', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.supplierId).toBe('sup-7')
  })

  it('maps "open" status to "sent"', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.status).toBe('sent')
  })

  it('converts financials.total.amount string float to integer minor units', () => {
    const result = transformPurchaseOrder(rawPO)
    // "500.00" → Math.round(500 * 100) = 50000
    expect(result.totalAmount).toBe(50000)
  })

  it('maps currency from financials.total.currency', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.currency).toBe('EUR')
  })

  it('maps date to orderedAt', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps desiredDeliveryDate to expectedAt', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('maps confirmedDeliveryDate to receivedAt', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.receivedAt).toBe('2024-03-16T00:00:00.000Z')
  })

  it('maps positions to lines with minor unit unitCost', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('prod-99')
    expect(result.lines[0]!.quantityOrdered).toBe(10)
    // "50.00" → Math.round(50 * 100) = 5000
    expect(result.lines[0]!.unitCost).toBe(5000)
  })

  it('sets platform=xentral', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.platform).toBe('xentral')
  })

  it('produces a schema-valid PurchaseOrder', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })

  it('maps "partiallyDelivered" status to "partially_received"', () => {
    const result = transformPurchaseOrder({ ...rawPO, status: 'partiallyDelivered' })
    expect(result.status).toBe('partially_received')
  })

  it('maps "delivered" status to "received"', () => {
    const result = transformPurchaseOrder({ ...rawPO, status: 'delivered' })
    expect(result.status).toBe('received')
  })

  it('maps "cancelled" status to "cancelled"', () => {
    const result = transformPurchaseOrder({ ...rawPO, status: 'cancelled' })
    expect(result.status).toBe('cancelled')
  })
})
