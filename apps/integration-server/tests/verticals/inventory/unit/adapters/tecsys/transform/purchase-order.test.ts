import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawTecsysPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/tecsys/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

function makeRaw(overrides: Partial<RawTecsysPurchaseOrder> = {}): RawTecsysPurchaseOrder {
  return {
    InternalOrderId: 'INT-PO-555',
    ExternalOrderId: 'PO-EXT-555',
    VendorId: 'VENDOR-A',
    Status: 'SUBMITTED',
    Currency: 'USD',
    OrderTotal: 1000.0,
    SubTotal: 900.0,
    DestinationLocationInternalName: 'LOC-MAIN',
    OrderDate: '2024-03-01T00:00:00Z',
    ExpectedDeliveryDate: '2024-03-15T00:00:00Z',
    CompletedDate: undefined,
    Lines: [
      {
        Sku: 'SKU-TECSYS-001',
        QuantityOrdered: 40,
        QuantityReceived: 20,
        UnitCost: 25.0,
        LineTotal: 1000.0,
      },
    ],
    ...overrides,
  }
}

describe('transformPurchaseOrder (tecsys)', () => {
  it('maps id from InternalOrderId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.id).toBe('INT-PO-555')
  })

  it('maps externalId from ExternalOrderId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.externalId).toBe('PO-EXT-555')
  })

  it('maps number from ExternalOrderId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.number).toBe('PO-EXT-555')
  })

  it('maps supplierId from VendorId and destinationLocationId', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.supplierId).toBe('VENDOR-A')
    expect(result.destinationLocationId).toBe('LOC-MAIN')
  })

  it('maps status "SUBMITTED" → "sent"', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'SUBMITTED' }))
    expect(result.status).toBe('sent')
  })

  it('maps status "PARTIALLY RECEIVED" → "partially_received"', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'PARTIALLY RECEIVED' }))
    expect(result.status).toBe('partially_received')
  })

  it('maps status "CANCELLED" → "cancelled"', () => {
    const result = transformPurchaseOrder(makeRaw({ Status: 'CANCELLED' }))
    expect(result.status).toBe('cancelled')
  })

  it('converts OrderTotal and SubTotal to integer minor units (cents)', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.totalAmount).toBe(100000)
    expect(result.subtotalAmount).toBe(90000)
  })

  it('maps line items with minor-unit conversion', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0]!.productId).toBe('SKU-TECSYS-001')
    expect(result.lines[0]!.quantityOrdered).toBe(40)
    expect(result.lines[0]!.quantityReceived).toBe(20)
    expect(result.lines[0]!.unitCost).toBe(2500)
    expect(result.lines[0]!.lineTotal).toBe(100000)
  })

  it('maps orderedAt and expectedAt as ISO strings', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('platform is "tecsys"', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(result.platform).toBe('tecsys')
  })

  it('handles missing Lines', () => {
    const result = transformPurchaseOrder(makeRaw({ Lines: undefined }))
    expect(result.lines).toEqual([])
  })

  it('passes PurchaseOrderSchema validation', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
