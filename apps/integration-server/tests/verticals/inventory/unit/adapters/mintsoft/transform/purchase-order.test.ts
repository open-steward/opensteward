/**
 * The fixture uses only properties of the `ASN`, `ASNItem` and `ASNStatus`
 * definitions in https://api.mintsoft.co.uk/swagger/docs/v1 (the spec gives
 * types, not example values), including its spelling `QuantityReceieved`.
 */
import { describe, it, expect } from 'vitest'
import {
  transformPurchaseOrder,
  type RawMintsoftASN,
} from '../../../../../../../src/verticals/inventory/adapters/mintsoft/transform/purchase-order'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/inventory/schema/purchase-order'

describe('mintsoft transformPurchaseOrder', () => {
  const raw: RawMintsoftASN = {
    ID: 55,
    POReference: 'PO-REF-001',
    Supplier: 'Acme Supplies',
    ProductSupplierId: 99,
    ProductSupplier: 'Acme Supplies',
    WarehouseId: 7,
    ClientId: 10,
    ASNStatus: { ID: 4, Name: 'Booked In' },
    ASNStatusId: 4,
    EstimatedDelivery: '2024-03-01T00:00:00Z',
    BookedInDate: '2024-03-02T09:30:00Z',
    Comments: 'Handle with care',
    GoodsInType: 'Pallet',
    LastUpdated: '2024-03-02T09:31:00Z',
    Items: [
      {
        ID: 501,
        ASNId: 55,
        ProductId: 123,
        SKU: 'SKU-ABC',
        QuantityExpected: 10,
        QuantityReceieved: 8,
      },
    ],
  }

  it('maps id and externalId from ID as string', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.id).toBe('55')
    expect(result.externalId).toBe('55')
  })

  it('maps number from POReference', () => {
    expect(transformPurchaseOrder(raw).number).toBe('PO-REF-001')
  })

  it('maps supplierId from ProductSupplierId', () => {
    expect(transformPurchaseOrder(raw).supplierId).toBe('99')
  })

  it('throws rather than invent a supplier id when ProductSupplierId is absent', () => {
    const { ProductSupplierId: _omit, ...rest } = raw
    expect(() => transformPurchaseOrder(rest as RawMintsoftASN)).toThrow(/ProductSupplierId/)
  })

  it('maps destinationLocationId from WarehouseId', () => {
    expect(transformPurchaseOrder(raw).destinationLocationId).toBe('7')
  })

  it('reports status unknown, since ASN status names are per account, and keeps them in metadata', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.status).toBe('unknown')
    expect(result.metadata.asnStatus).toBe('Booked In')
    expect(result.metadata.asnStatusId).toBe('4')
  })

  it('maps lines from Items: ProductId, QuantityExpected and QuantityReceieved', () => {
    expect(transformPurchaseOrder(raw).lines).toEqual([
      { productId: '123', quantityOrdered: 10, quantityReceived: 8 },
    ])
  })

  it('throws rather than default an item quantity or product id', () => {
    expect(() => transformPurchaseOrder({ ...raw, Items: [{ ProductId: 123 }] })).toThrow(
      /QuantityExpected/,
    )
    expect(() =>
      transformPurchaseOrder({ ...raw, Items: [{ SKU: 'SKU-ABC', QuantityExpected: 1 }] }),
    ).toThrow(/ProductId/)
  })

  it('maps expectedAt from EstimatedDelivery and receivedAt from BookedInDate', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.expectedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.receivedAt).toBe('2024-03-02T09:30:00.000Z')
  })

  it('invents no money: currency and amounts stay absent', () => {
    const result = transformPurchaseOrder(raw)
    expect(result.currency).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.lines[0]?.unitCost).toBeUndefined()
  })

  it('sets platform to mintsoft', () => {
    expect(transformPurchaseOrder(raw).platform).toBe('mintsoft')
  })

  it('produces output that satisfies PurchaseOrderSchema', () => {
    const parsed = PurchaseOrderSchema.parse(transformPurchaseOrder(raw))
    expect(parsed.id).toBe('55')
    expect(parsed.lines).toHaveLength(1)
  })
})
