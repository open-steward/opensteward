import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawSysproPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/syspro/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

function makeRaw(overrides: Partial<RawSysproPurchaseOrder> = {}): RawSysproPurchaseOrder {
  return {
    PurchaseOrder: 'PO-1001',
    Supplier: 'SUP001',
    SupplierName: 'Acme Corp',
    OrderStatus: '1',
    OrderDate: '2024-03-01T00:00:00Z',
    DueDate: '2024-03-15T00:00:00Z',
    Currency: 'USD',
    OriginalOrderValue: 5000,
    CompletedDate: undefined,
    Warehouse: 'WH01',
    PorMasterDetail: [
      {
        PurchaseOrder: 'PO-1001',
        Line: 1,
        StockCode: 'WIDGET-RED',
        OrderQty: 100,
        ReceivedQty: 50,
        UnitCost: 25,
        LineValue: 2500,
        DueDate: '2024-03-15T00:00:00Z',
      },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder (syspro)', () => {
  it('maps id, externalId, and number from PurchaseOrder', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('PO-1001')
    expect(result.externalId).toBe('PO-1001')
    expect(result.number).toBe('PO-1001')
  })

  it('maps supplierId from Supplier and destinationLocationId from Warehouse', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.supplierId).toBe('SUP001')
    expect(result.destinationLocationId).toBe('WH01')
  })

  it('maps status "1" → "sent" (Active/Open)', () => {
    const result = transformPurchaseOrder(makeRaw({ OrderStatus: '1' }))
    expect(result.status).toBe('sent')
  })

  it('maps status "2" → "closed" (Completed)', () => {
    const result = transformPurchaseOrder(makeRaw({ OrderStatus: '2' }))
    expect(result.status).toBe('closed')
  })

  it('maps status "3" → "cancelled"', () => {
    const result = transformPurchaseOrder(makeRaw({ OrderStatus: '3' }))
    expect(result.status).toBe('cancelled')
  })

  it('maps status "6" → "partially_received"', () => {
    const result = transformPurchaseOrder(makeRaw({ OrderStatus: '6' }))
    expect(result.status).toBe('partially_received')
  })

  it('maps totalAmount from OriginalOrderValue', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.totalAmount).toBe(5000)
  })

  it('maps line items from PorMasterDetail', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('WIDGET-RED')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.quantityReceived).toBe(50)
    expect(result.lines[0]!.unitCost).toBe(25)
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('platform is "syspro"', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.platform).toBe('syspro')
  })

  it('handles missing PorMasterDetail', () => {
    const result = transformPurchaseOrder(makeRaw({ PorMasterDetail: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
