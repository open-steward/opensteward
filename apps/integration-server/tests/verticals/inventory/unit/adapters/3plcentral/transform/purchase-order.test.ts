import { describe, it, expect } from 'vitest'
import { transformPurchaseOrder } from '../../../../../../../src/verticals/inventory/adapters/3plcentral/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder', () => {
  const raw = {
    receiverId: 5,
    referenceNum: 'PO-001',
    supplierIdentifier: { id: 10, name: 'Acme' },
    facilityIdentifier: { id: 1, name: 'SF Warehouse' },
    statusIdentifier: { name: 'Received' },
    receivedDate: '2024-03-01T00:00:00Z',
    lineItems: [
      {
        itemIdentifier: { id: 101 },
        qty: 50,
        receivedQty: 50,
        cost: 5.0,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from receiverId', () => {
    expect(result.id).toBe('5')
  })

  it('maps status Received → received', () => {
    expect(result.status).toBe('received')
  })

  it('sets supplierId', () => {
    expect(result.supplierId).toBe('10')
  })

  it('maps line items', () => {
    expect(result.lines).toHaveLength(1)
  })

  it('sets line productId', () => {
    expect(result.lines[0].productId).toBe('101')
  })

  it('sets destinationLocationId', () => {
    expect(result.destinationLocationId).toBe('facility:1')
  })

  it('sets platform to 3plcentral', () => {
    expect(result.platform).toBe('3plcentral')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (statusName: string) => ({
    receiverId: 99,
    supplierIdentifier: { id: 1 },
    statusIdentifier: { name: statusName },
    lineItems: [],
  })

  it('maps "New" → draft', () => {
    expect(transformPurchaseOrder(makeRaw('New')).status).toBe('draft')
  })

  it('maps "Cancelled" → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw('Cancelled')).status).toBe('cancelled')
  })
})
