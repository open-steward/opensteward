import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawKoronaPosStockReceipt,
} from '../../../../../../../src/verticals/inventory/adapters/korona-pos/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('korona-pos transformPurchaseOrder', () => {
  const raw: RawKoronaPosStockReceipt = {
    id: 'sr-uuid-001',
    number: 'SR-2024-001',
    active: true,
    status: 'BOOKED',
    supplier: { id: 'sup-uuid-001', number: 'SUP-001' },
    organizationalUnit: { id: 'ou-uuid-001', number: 'WH-001' },
    arrivalDate: '2024-03-15T00:00:00Z',
    bookingTime: '2024-03-14T12:00:00Z',
    createTime: '2024-03-01T00:00:00Z',
    description: 'Monthly restocking',
    itemsCount: 1,
    items: [
      {
        product: { id: 'prod-uuid-001', number: 'SKU-001' },
        amount: { expected: 50, received: 50 },
        purchasePrice: { actual: 9.99, old: 8.5 },
        index: 1,
      },
    ],
  }

  it('maps id from raw.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('sr-uuid-001')
    expect(result.externalId).toBe('sr-uuid-001')
  })

  it('maps number', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.number).toBe('SR-2024-001')
  })

  it('maps supplierId from supplier.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('sup-uuid-001')
  })

  it('maps destinationLocationId from organizationalUnit.id', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('ou-uuid-001')
  })

  it('maps status BOOKED to received', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('received')
  })

  it('maps status IN_PROGRESS to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'IN_PROGRESS' })
    expect(result.status).toBe('partially_received')
  })

  it('defaults status to draft for unknown value', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'UNKNOWN' })
    expect(result.status).toBe('draft')
  })

  it('currency is undefined (not set by KORONA)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBeUndefined()
  })

  it('totalAmount is undefined (not set by KORONA)', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.totalAmount).toBeUndefined()
  })

  it('maps line items converting price to minor units', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('prod-uuid-001')
    expect(result.lines[0].quantityOrdered).toBe(50)
    expect(result.lines[0].quantityReceived).toBe(50)
    expect(result.lines[0].unitCost).toBe(999)
  })

  it('maps orderedAt from createTime', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps receivedAt from bookingTime', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.receivedAt).toBe('2024-03-14T12:00:00.000Z')
  })

  it('maps expectedAt from arrivalDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to korona-pos', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('korona-pos')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    expect(() => PurchaseOrderSchema.parse(transformPurchaseOrder(raw))).not.toThrow()
  })
})
