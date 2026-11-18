import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawIqmetrixPurchaseOrder,
} from '../../../../../../../src/verticals/inventory/adapters/iqmetrix/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('transformPurchaseOrder — iqmetrix committed PO', () => {
  const raw: RawIqmetrixPurchaseOrder = {
    PurchaseOrderGuid: 'po-guid-001',
    PurchaseOrderId: 1001,
    VendorEntityId: 999,
    OrdererStoreEntityId: 12,
    ReceiverStoreEntityId: 12,
    EstimatedArrivalDate: '2024-04-01T00:00:00Z',
    ShippingCost: 15.0,
    Committed: true,
    ReferenceNumber: 'REF-001',
    Products: [
      {
        CatalogItemId: 'cat-uuid-001',
        VendorSKU: 'VS-001',
        Quantity: 100,
        QuantityReceived: 0,
        UnitCost: 10.5,
        LineTotal: 1050.0,
      },
    ],
  }
  const result = transformPurchaseOrder(raw)

  it('sets id from PurchaseOrderGuid', () => {
    expect(result.id).toBe('po-guid-001')
  })

  it('sets number from ReferenceNumber', () => {
    expect(result.number).toBe('REF-001')
  })

  it('maps Committed=true with no Status → sent', () => {
    expect(result.status).toBe('sent')
  })

  it('sets supplierId from VendorEntityId', () => {
    expect(result.supplierId).toBe('999')
  })

  it('sets destinationLocationId from ReceiverStoreEntityId', () => {
    expect(result.destinationLocationId).toBe('12')
  })

  it('maps line productId from CatalogItemId', () => {
    expect(result.lines[0]?.productId).toBe('cat-uuid-001')
  })

  it('converts line unitCost to cents', () => {
    expect(result.lines[0]?.unitCost).toBe(1050)
  })

  it('converts line lineTotal to cents', () => {
    expect(result.lines[0]?.lineTotal).toBe(105000)
  })

  it('sets platform to iqmetrix', () => {
    expect(result.platform).toBe('iqmetrix')
  })

  it('passes schema validation', () => {
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})

describe('transformPurchaseOrder — status mapping', () => {
  const makeRaw = (Status: string, Committed = false): RawIqmetrixPurchaseOrder => ({
    PurchaseOrderGuid: 'po-guid-999',
    VendorEntityId: 1,
    Status,
    Committed,
    Products: [],
  })

  it('maps RECEIVED → received', () => {
    expect(transformPurchaseOrder(makeRaw('RECEIVED')).status).toBe('received')
  })

  it('maps PARTIALLYRECEIVED → partially_received', () => {
    expect(transformPurchaseOrder(makeRaw('PARTIALLYRECEIVED')).status).toBe('partially_received')
  })

  it('maps CANCELLED → cancelled', () => {
    expect(transformPurchaseOrder(makeRaw('CANCELLED')).status).toBe('cancelled')
  })

  it('maps uncommitted with no status → draft', () => {
    expect(transformPurchaseOrder(makeRaw('', false)).status).toBe('draft')
  })
})
