import { describe, it, expect } from 'vitest'
import { OrderSchema } from '../../../../../../../src/verticals/accounting/schema/order'
import { transformOrder, type VismaOrder } from '../../../../../../../src/verticals/accounting/adapters/visma/transform/order'

function makeOrder(overrides: Partial<VismaOrder> = {}): VismaOrder {
  return {
    Id: 'order-uuid-1234',
    CustomerId: 'cust-uuid-5678',
    CustomerNumber: 'C001',
    OrderDate: '2024-03-15',
    DeliveryDate: '2024-04-01',
    Status: 1,
    CurrencyCode: 'SEK',
    TotalAmount: 12500,
    TotalVatAmount: 2500,
    YourReference: 'Your ref',
    OurReference: 'Our ref',
    InvoiceAddress1: 'Billing Street 1',
    InvoiceAddress2: '',
    InvoiceCity: 'Stockholm',
    InvoicePostalCode: '11122',
    InvoiceCountryCode: 'SE',
    DeliveryAddress1: 'Delivery Road 5',
    DeliveryAddress2: '',
    DeliveryCity: 'Gothenburg',
    DeliveryPostalCode: '41101',
    DeliveryCountryCode: 'SE',
    Rows: [
      {
        LineNumber: 1,
        ArticleId: 'art-uuid-001',
        ArticleNumber: 'ART-001',
        Text: 'Widget A',
        UnitPrice: 100,
        Quantity: 100,
        DiscountPercentage: 0,
        TotalAmount: 10000,
        TotalVatAmount: 2500,
        CostCenterItemId1: '',
        ProjectId: '',
      },
    ],
    CreatedUtc: '2024-03-15T10:00:00Z',
    ModifiedUtc: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-uuid-1234')
    expect(result.type).toBe('SALES')
    expect(result.contactId).toBe('cust-uuid-5678')
    expect(result.currency).toBe('SEK')
    expect(result.totalAmount).toBe(12500)
  })

  it('maps status: draft (0)', () => {
    expect(transformOrder(makeOrder({ Status: 0 })).status).toBe('DRAFT')
  })

  it('maps status: active (1)', () => {
    expect(transformOrder(makeOrder({ Status: 1 })).status).toBe('ACTIVE')
  })

  it('maps status: completed (2)', () => {
    expect(transformOrder(makeOrder({ Status: 2 })).status).toBe('COMPLETED')
  })

  it('maps status: cancelled (3)', () => {
    expect(transformOrder(makeOrder({ Status: 3 })).status).toBe('CANCELLED')
  })

  it('parses order date', () => {
    const result = transformOrder(makeOrder())
    expect(result.postedAt).toEqual(new Date('2024-03-15'))
  })

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      address1: 'Billing Street 1',
      address2: undefined,
      city: 'Stockholm',
      postalCode: '11122',
      country: 'SE',
    })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      address1: 'Delivery Road 5',
      address2: undefined,
      city: 'Gothenburg',
      postalCode: '41101',
      country: 'SE',
    })
  })

  it('maps lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]
    expect(li.id).toBe('1')
    expect(li.itemId).toBe('art-uuid-001')
    expect(li.itemDescription).toBe('Widget A')
    expect(li.unitAmount).toBe(100)
    expect(li.unitQuantity).toBe(100)
    expect(li.totalAmount).toBe(10000)
    expect(li.taxAmount).toBe(2500)
  })

  it('passes raw object through as metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined for empty billing address', () => {
    const result = transformOrder(
      makeOrder({ InvoiceAddress1: '', InvoiceCity: '' }),
    )
    expect(result.billingAddress).toBeUndefined()
  })

  it('returns undefined for empty shipping address', () => {
    const result = transformOrder(
      makeOrder({ DeliveryAddress1: '', DeliveryCity: '' }),
    )
    expect(result.shippingAddress).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
