import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawDeposcoPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/deposco/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('deposco transformPurchaseOrder', () => {
  const raw: RawDeposcoPurchaseOrder = {
    orderNumber: 'DEP-PO-001',
    vendorNumber: 'vendor-001',
    vendorName: 'FastenersCo',
    status: 'OPEN',
    currency: 'USD',
    facilityNumber: 'FAC-001',
    lines: [
      {
        itemNumber: 'DEP-SKU-001',
        quantityOrdered: 100,
        quantityReceived: 0,
        unitCost: 1.25,
        lineTotal: 125,
      },
    ],
    orderDate: '2024-03-01T00:00:00Z',
    expectedDate: '2024-03-15T00:00:00Z',
  }

  it('maps id, externalId, and number from orderNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('DEP-PO-001')
    expect(result.externalId).toBe('DEP-PO-001')
    expect(result.number).toBe('DEP-PO-001')
  })

  it('maps supplierId from vendorNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.supplierId).toBe('vendor-001')
  })

  it('maps status OPEN to sent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('sent')
  })

  it('maps status PARTIAL to partially_received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'PARTIAL' })
    expect(result.status).toBe('partially_received')
  })

  it('maps status RECEIVED to received', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'RECEIVED' })
    expect(result.status).toBe('received')
  })

  it('maps status CLOSED to closed', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CLOSED' })
    expect(result.status).toBe('closed')
  })

  it('maps status CANCELLED to cancelled', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'CANCELLED' })
    expect(result.status).toBe('cancelled')
  })

  it('defaults unknown status to draft', () => {
    const result = transformPurchaseOrder({ ...raw, status: 'UNKNOWN' })
    expect(result.status).toBe('draft')
  })

  it('maps destinationLocationId from facilityNumber', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.destinationLocationId).toBe('FAC-001')
  })

  it('maps lines correctly', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.lines).toHaveLength(1)
    expect(result.lines[0].productId).toBe('DEP-SKU-001')
    expect(result.lines[0].quantityOrdered).toBe(100)
    expect(result.lines[0].unitCost).toBe(1.25)
  })

  it('maps orderedAt and expectedAt', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.orderedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.expectedAt).toBe('2024-03-15T00:00:00.000Z')
  })

  it('sets platform to deposco', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.platform).toBe('deposco')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const result = transformPurchaseOrder(raw)
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
