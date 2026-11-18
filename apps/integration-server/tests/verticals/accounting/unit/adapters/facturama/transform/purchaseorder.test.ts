import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type FacturamaPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/facturama/transform/purchaseorder'

function makeRaw(overrides: Partial<FacturamaPurchaseOrder> = {}): FacturamaPurchaseOrder {
  return {
    Id: 'po-1',
    SupplierId: 'supp-1',
    SupplierName: 'Supplier Co',
    Currency: 'MXN',
    Total: 2000,
    OrderDate: '2024-06-01',
    Status: 'active',
    ShippingStreet: '',
    ShippingCity: '',
    ShippingState: '',
    ShippingZipCode: '',
    ShippingCountry: '',
    Reference: '',
    Items: [],
    ...overrides,
  }
}

describe('facturama transformPurchaseOrder', () => {
  it('maps Id to id', () => {
    expect(transformPurchaseOrder(makeRaw()).id).toBe('po-1')
  })
  it('handles fields gracefully', () => {
    expect(() => transformPurchaseOrder(makeRaw())).not.toThrow()
  })
  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })
  it('maps status received -> COMPLETED', () => {
    expect(transformPurchaseOrder(makeRaw({ Status: 'received' })).status).toBe('COMPLETED')
  })
  it('maps status cancelled -> CANCELLED', () => {
    expect(transformPurchaseOrder(makeRaw({ Status: 'cancelled' })).status).toBe('CANCELLED')
  })
  it('maps OrderDate to postedAt as Date', () => {
    expect(transformPurchaseOrder(makeRaw()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makeRaw())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
