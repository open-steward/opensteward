import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawBoxstormPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/boxstorm/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('boxstorm transformPurchaseOrder', () => {
  const raw: RawBoxstormPurchaseOrder = {
    id: 200,
    number: 'PO-2024-001',
    status: 'Issued',
    vendor: { id: 10, name: 'Acme Supplies' },
    currency: 'USD',
    dateCreated: '2024-03-01T00:00:00Z',
    dateConfirmed: '2024-03-01T00:00:00Z',
    dateScheduled: '2024-03-01T00:00:00Z',
    dateCompleted: '2024-03-01T00:00:00Z',
    locationGroup: { id: 5, name: 'Main WH' },
    poItems: [
      {
        id: 1,
        part: { id: 101, name: 'Widget Alpha' },
        quantity: 20,
        quantityFulfilled: 10,
        unitCost: 9.99,
        totalCost: 199.8,
      },
    ],
    note: 'Rush order',
  }

  it('maps id and externalId as string from numeric id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('200')
    expect(result.externalId).toBe('200')
  })

  it('maps number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('PO-2024-001')
  })

  it('maps supplierId from vendor.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('10')
  })

  it('maps destinationLocationId from locationGroup.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('5')
  })

  it('maps Issued status to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps Draft status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Draft' })
    expect(result.status).toBe('draft')
  })

  it('maps Fulfilled status to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Fulfilled' })
    expect(result.status).toBe('received')
  })

  it('maps Void status to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'Void' })
    expect(result.status).toBe('cancelled')
  })

  it('maps currency', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBe('USD')
  })

  it('maps line items', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('101')
    expect(result.lines[0]!.quantityOrdered).toBe(20)
    expect(result.lines[0]!.quantityReceived).toBe(10)
    expect(result.lines[0]!.unitCost).toBe(9.99)
  })

  it('maps orderedAt from dateConfirmed', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps expectedAt from dateScheduled', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets platform to boxstorm', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('boxstorm')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
