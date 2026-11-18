import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/sana-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

describe('transformOrder', () => {
  it('maps Id and OrderNumber to id and orderNumber', () => {
    const result = transformOrder({ Id: '1001', OrderNumber: 'ORD-100' })
    expect(result.id).toBe('1001')
    expect(result.orderNumber).toBe('ORD-100')
  })

  it('maps numeric Id (stringified) and numeric OrderNumber', () => {
    const result = transformOrder({ Id: 2002, OrderNumber: 200 })
    expect(result.id).toBe('2002')
    expect(result.orderNumber).toBe('200')
  })

  it('maps Status "confirmed" → financialStatus PAID, fulfillmentStatus undefined', () => {
    const result = transformOrder({ Id: 'o1', Status: 'confirmed' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBeUndefined()
  })

  it('maps Status "shipped" → fulfillmentStatus FULFILLED', () => {
    const result = transformOrder({ Id: 'o2', Status: 'shipped' })
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.id).toBe('o2')
  })

  it('maps Status "open" → financialStatus PENDING and fulfillmentStatus UNFULFILLED', () => {
    const result = transformOrder({ Id: 'o3', Status: 'open' })
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Status "cancelled" → financialStatus VOIDED', () => {
    const result = transformOrder({ Id: 'o4', Status: 'cancelled' })
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.id).toBe('o4')
  })

  it('converts TotalAmount via majorToMinor', () => {
    const result = transformOrder({ Id: 'o5', TotalAmount: 150.0, Currency: 'EUR' })
    expect(result.totalPrice?.amount).toBe(15000)
    expect(result.totalPrice?.currency).toBe('EUR')
  })

  it('converts SubTotal, TotalTax, ShippingAmount via majorToMinor', () => {
    const result = transformOrder({
      Id: 'o6',
      Currency: 'USD',
      SubTotal: 100.0,
      TotalTax: 10.0,
      ShippingAmount: 5.0,
    })
    expect(result.subtotalPrice?.amount).toBe(10000)
    expect(result.totalTax?.amount).toBe(1000)
    expect(result.totalShipping?.amount).toBe(500)
  })

  it('maps Lines array to lineItems', () => {
    const result = transformOrder({
      Id: 'o7',
      Currency: 'EUR',
      Lines: [
        { Id: 'li1', Title: 'Widget', Quantity: 2, UnitPrice: 10.0 },
        { Id: 'li2', Title: 'Gadget', Quantity: 1, UnitPrice: 25.0 },
      ],
    })
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems?.[0].id).toBe('li1')
    expect(result.lineItems?.[1].title).toBe('Gadget')
  })

  it('converts line item UnitPrice via majorToMinor', () => {
    const result = transformOrder({
      Id: 'o8',
      Currency: 'GBP',
      Lines: [{ Id: 'li1', Title: 'Item', Quantity: 1, UnitPrice: 9.99 }],
    })
    expect(result.lineItems?.[0].price.amount).toBe(999)
    expect(result.lineItems?.[0].price.currency).toBe('GBP')
  })

  it('maps BillingAddress.Street → billingAddress.line1 and CountryCode → country', () => {
    const result = transformOrder({
      Id: 'o9',
      BillingAddress: {
        Street: '123 Main St',
        City: 'Amsterdam',
        ZipCode: '1011',
        CountryCode: 'NL',
      },
    })
    expect(result.billingAddress?.line1).toBe('123 Main St')
    expect(result.billingAddress?.country).toBe('NL')
  })

  it('maps BillingAddress.City and ZipCode', () => {
    const result = transformOrder({
      Id: 'o10',
      BillingAddress: {
        Street: '5 Baker St',
        City: 'London',
        ZipCode: 'NW1 6XE',
        CountryCode: 'GB',
      },
    })
    expect(result.billingAddress?.city).toBe('London')
    expect(result.billingAddress?.postalCode).toBe('NW1 6XE')
  })

  it('maps ShippingAddress independently', () => {
    const result = transformOrder({
      Id: 'o11',
      ShippingAddress: { Street: '10 Ship Lane', City: 'Rotterdam', CountryCode: 'NL' },
    })
    expect(result.shippingAddress?.line1).toBe('10 Ship Lane')
    expect(result.shippingAddress?.city).toBe('Rotterdam')
  })

  it('converts DateCreated to ISO datetime with milliseconds', () => {
    const result = transformOrder({
      Id: 'o12',
      DateCreated: '2024-02-01T00:00:00Z',
    })
    expect(result.createdAt).toBe('2024-02-01T00:00:00.000Z')
    expect(result.id).toBe('o12')
  })

  it('maps camelCase fields (id, status, currency, totalAmount)', () => {
    const result = transformOrder({
      id: 'camel-order',
      status: 'confirmed',
      currency: 'USD',
      totalAmount: 75.5,
    })
    expect(result.id).toBe('camel-order')
    expect(result.financialStatus).toBe('PAID')
    expect(result.totalPrice?.amount).toBe(7550)
    expect(result.currency).toBe('USD')
  })

  it('defaults currency to EUR when absent', () => {
    const result = transformOrder({ Id: 'o13', TotalAmount: 50 })
    expect(result.currency).toBe('EUR')
    expect(result.totalPrice?.currency).toBe('EUR')
  })

  it('passes OrderSchema.parse without throwing', () => {
    const result = transformOrder({
      Id: 'schema-order',
      OrderNumber: 'ORD-999',
      Status: 'confirmed',
      Currency: 'EUR',
      TotalAmount: 150.0,
      DateCreated: '2024-02-01T00:00:00Z',
      Lines: [{ Id: 'li1', Title: 'Product A', Quantity: 3, UnitPrice: 50.0 }],
      BillingAddress: {
        Street: '1 Commerce St',
        City: 'Utrecht',
        ZipCode: '3512',
        CountryCode: 'NL',
      },
    })
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder', () => {
  it('maps customerId and email to PascalCase output', () => {
    const result = untransformOrder({ customerId: 'cust-1', email: 'buyer@example.com' })
    expect(result.CustomerId).toBe('cust-1')
    expect(result.Email).toBe('buyer@example.com')
  })

  it('maps shippingAddress fields to PascalCase Sana shape', () => {
    const result = untransformOrder({
      shippingAddress: {
        line1: '10 Ship Rd',
        city: 'Haarlem',
        postalCode: '2011',
        country: 'NL',
      },
    })
    const addr = result.ShippingAddress as Record<string, unknown>
    expect(addr.Street).toBe('10 Ship Rd')
    expect(addr.CountryCode).toBe('NL')
  })

  it('maps lineItems to Lines with ProductId and Quantity', () => {
    const result = untransformOrder({
      lineItems: [
        {
          id: 'li1',
          productId: 'prod-1',
          variantId: 'var-1',
          title: 'Bolt',
          quantity: 5,
          price: { amount: 100, currency: 'EUR' },
          metadata: {},
        },
      ],
    })
    const lines = result.Lines as Record<string, unknown>[]
    expect(lines).toHaveLength(1)
    expect(lines[0].ProductId).toBe('prod-1')
    expect(lines[0].Quantity).toBe(5)
  })
})
