import { describe, it, expect } from 'vitest'
import { SalesOrderSchema } from '../../../../../../../src/verticals/accounting/schema/salesorder'
import { transformSalesOrder, type VismaSalesOrder } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/salesorder'

function makeSalesOrder(overrides: Partial<VismaSalesOrder> = {}): VismaSalesOrder {
  return {
    Id: 'so-uuid-1234',
    CustomerId: 'cust-uuid-5678',
    CustomerNumber: 'C001',
    OrderDate: '2024-05-01',
    DeliveryDate: '2024-05-15',
    Status: 1,
    CurrencyCode: 'SEK',
    TotalAmount: 8000,
    TotalVatAmount: 1600,
    YourReference: 'PO-REF-001',
    OurReference: 'Sales dept',
    InvoiceAddress1: 'Billing St 10',
    InvoiceAddress2: '',
    InvoiceCity: 'Malmö',
    InvoicePostalCode: '21145',
    InvoiceCountryCode: 'SE',
    DeliveryAddress1: 'Warehouse Rd 3',
    DeliveryAddress2: '',
    DeliveryCity: 'Lund',
    DeliveryPostalCode: '22100',
    DeliveryCountryCode: 'SE',
    Rows: [
      {
        LineNumber: 1,
        ArticleId: 'art-uuid-001',
        ArticleNumber: 'ART-100',
        Text: 'Product X',
        UnitPrice: 200,
        Quantity: 40,
        DiscountPercentage: 0,
        TotalAmount: 8000,
        TotalVatAmount: 1600,
        CostCenterItemId1: '',
        ProjectId: '',
      },
    ],
    CreatedUtc: '2024-05-01T08:00:00Z',
    ModifiedUtc: '2024-05-01T09:00:00Z',
    ...overrides,
  }
}

describe('transformSalesOrder', () => {
  it('maps core fields', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.id).toBe('so-uuid-1234')
    expect(result.contactId).toBe('cust-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(8000)
  })

  it('maps status: draft (0)', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 0 })).status).toBe('DRAFT')
  })

  it('maps status: active (1)', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status: completed (2)', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status: cancelled (3)', () => {
    expect(transformSalesOrder(makeSalesOrder({ Status: 3 })).status).toBe('CANCELLED')
  })

  it('parses order date', () => {
    expect(transformSalesOrder(makeSalesOrder()).postedAt).toEqual(new Date('2024-05-01'))
  })

  it('maps billing address', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.billingAddress).toEqual({
      address1: 'Billing St 10',
      address2: undefined,
      city: 'Malmö',
      postalCode: '21145',
      country: 'SE',
    })
  })

  it('maps shipping address', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.shippingAddress).toEqual({
      address1: 'Warehouse Rd 3',
      address2: undefined,
      city: 'Lund',
      postalCode: '22100',
      country: 'SE',
    })
  })

  it('maps lineItems', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.itemId).toBe('art-uuid-001')
    expect(li.unitAmount).toBe(200)
    expect(li.unitQuantity).toBe(40)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeSalesOrder()
    expect(transformSalesOrder(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformSalesOrder(makeSalesOrder())
    expect(() => SalesOrderSchema.parse(result)).not.toThrow()
  })
})
