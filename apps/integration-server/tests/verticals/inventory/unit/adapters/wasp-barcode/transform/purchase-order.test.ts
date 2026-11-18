import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawWaspBarcodePurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/wasp-barcode/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

const rawPO: RawWaspBarcodePurchaseOrder = {
  OrderNumber: 'PO-1001',
  VendorNumber: 'VEN-42',
  SiteName: 'MAIN',
  Status: 'Open-PoOpenIssued',
  OrderDate: '2024-03-01T00:00:00Z',
  ExpectedDate: '2024-03-15T00:00:00Z',
  Lines: [
    {
      ItemNumber: 'ITEM-001',
      Quantity: 100,
      QuantityReceived: 0,
      UnitCost: 5.0,
    },
    {
      ItemNumber: 'ITEM-002',
      Quantity: 50,
      QuantityReceived: 25,
      UnitCost: 10.0,
    },
  ],
}

describe('wasp-barcode transformPurchaseOrder', () => {
  it('maps OrderNumber to id', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.id).toBe('PO-1001')
    expect(result.number).toBe('PO-1001')
  })

  it('maps VendorNumber to supplierId', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.supplierId).toBe('VEN-42')
  })

  it('maps SiteName to destinationLocationId', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.destinationLocationId).toBe('MAIN')
  })

  it('maps Open-PoOpenIssued status to "sent"', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.status).toBe('sent')
  })

  it('maps OrderDate to orderedAt', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps lines with correct productId and quantities', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.lines).toHaveLength(2)
    expect(result.lines[0]!.productId).toBe('ITEM-001')
    expect(result.lines[0]!.quantityOrdered).toBe(100)
    expect(result.lines[0]!.unitCost).toBe(5.0)
    expect(result.lines[0]!.lineTotal).toBe(500)
  })

  it('sets platform=wasp-barcode', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(result.platform).toBe('wasp-barcode')
  })

  it('produces a schema-valid PurchaseOrder', () => {
    const result = transformPurchaseOrder(rawPO)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })

  it('maps Draft-OK status to "draft"', () => {
    const result = transformPurchaseOrder({ ...rawPO, Status: 'Draft-OK' })
    expect(result.status).toBe('draft')
  })

  it('maps Closed-PoReceived status to "received"', () => {
    const result = transformPurchaseOrder({ ...rawPO, Status: 'Closed-PoReceived' })
    expect(result.status).toBe('received')
  })
})
