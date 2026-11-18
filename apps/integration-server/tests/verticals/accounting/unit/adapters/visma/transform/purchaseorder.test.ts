import { describe, it, expect } from 'vitest'
import { PurchaseOrderSchema } from '../../../../../../../src/verticals/accounting/schema/purchaseorder'
import { transformPurchaseOrder, type VismaPurchaseOrder } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/purchaseorder'

function makePurchaseOrder(overrides: Partial<VismaPurchaseOrder> = {}): VismaPurchaseOrder {
  return {
    Id: 'po-uuid-1234',
    SupplierId: 'supp-uuid-5678',
    SupplierNumber: 'S001',
    OrderDate: '2024-06-01',
    DeliveryDate: '2024-06-15',
    Status: 1,
    CurrencyCode: 'EUR',
    TotalAmount: 15000,
    TotalVatAmount: 3000,
    YourReference: 'Ref-001',
    OurReference: 'Purchasing',
    DeliveryAddress1: 'Warehouse St 7',
    DeliveryAddress2: 'Building B',
    DeliveryCity: 'Uppsala',
    DeliveryPostalCode: '75320',
    DeliveryCountryCode: 'SE',
    Rows: [
      {
        LineNumber: 1,
        ArticleId: 'art-uuid-010',
        ArticleNumber: 'RAW-001',
        Text: 'Raw material',
        UnitPrice: 50,
        Quantity: 300,
        DiscountPercentage: 0,
        TotalAmount: 15000,
        TotalVatAmount: 3000,
        CostCenterItemId1: '',
        ProjectId: '',
      },
    ],
    CreatedUtc: '2024-06-01T10:00:00Z',
    ModifiedUtc: '2024-06-01T11:00:00Z',
    ...overrides,
  }
}

describe('transformPurchaseOrder', () => {
  it('maps core fields', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.id).toBe('po-uuid-1234')
    expect(result.contactId).toBe('supp-uuid-5678')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(15000)
  })

  it('maps status: draft (0)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 0 })).status).toBe('DRAFT')
  })

  it('maps status: active (1)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status: completed (2)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status: cancelled (3)', () => {
    expect(transformPurchaseOrder(makePurchaseOrder({ Status: 3 })).status).toBe('CANCELLED')
  })

  it('parses order date', () => {
    expect(transformPurchaseOrder(makePurchaseOrder()).postedAt).toEqual(new Date('2024-06-01'))
  })

  it('maps shipping address', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.shippingAddress).toEqual({
      address1: 'Warehouse St 7',
      address2: 'Building B',
      city: 'Uppsala',
      postalCode: '75320',
      country: 'SE',
    })
  })

  it('returns undefined for empty shipping address', () => {
    const result = transformPurchaseOrder(
      makePurchaseOrder({ DeliveryAddress1: '', DeliveryCity: '' }),
    )
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps lineItems', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('art-uuid-010')
    expect(li.itemDescription).toBe('Raw material')
    expect(li.unitAmount).toBe(50)
    expect(li.unitQuantity).toBe(300)
  })

  it('passes raw object through as metadata', () => {
    const raw = makePurchaseOrder()
    expect(transformPurchaseOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformPurchaseOrder(makePurchaseOrder())
    expect(() => PurchaseOrderSchema.parse(result)).not.toThrow()
  })
})
