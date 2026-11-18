import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawAmazonOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/amazon-sp/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawAmazonOrder> = {}): RawAmazonOrder {
  return {
    AmazonOrderId: '123-4567890-1234567',
    SellerOrderId: 'SO-1001',
    PurchaseDate: '2024-05-01T10:00:00Z',
    LastUpdateDate: '2024-05-01T12:00:00Z',
    OrderStatus: 'Shipped',
    FulfillmentChannel: 'AFN',
    SalesChannel: 'Amazon.com',
    NumberOfItemsShipped: 2,
    NumberOfItemsUnshipped: 0,
    MarketplaceId: 'ATVPDKIKX0DER',
    OrderTotal: { CurrencyCode: 'USD', Amount: '49.98' },
    OrderItems: [
      {
        ASIN: 'B0ABCDE123',
        SellerSKU: 'TEE-S-BLUE',
        OrderItemId: 'OI-9001',
        Title: 'Ocean Blue T-Shirt',
        QuantityOrdered: 2,
        QuantityShipped: 2,
        ItemPrice: { CurrencyCode: 'USD', Amount: '49.98' },
      },
    ],
    // The following fields SHOULD be stripped by the transform — Amazon's
    // default data release does not include them, but adapters could
    // theoretically receive them via RDT. They must not leak.
    BuyerInfo: {
      BuyerEmail: 'buyer@example.com',
      BuyerName: 'A. Shopper',
    },
    ShippingAddress: {
      Name: 'A. Shopper',
      AddressLine1: '1 Programming Ln',
      City: 'London',
      PostalCode: 'NW1 2AB',
      CountryCode: 'GB',
    },
    ...overrides,
  }
}

describe('transformOrder (AmazonSP)', () => {
  it('maps core fields and uses AmazonOrderId as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('123-4567890-1234567')
    expect(result.orderNumber).toBe('123-4567890-1234567')
    expect(result.name).toBe('SO-1001')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 4998, currency: 'USD' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.createdAt).toBe('2024-05-01T10:00:00Z')
  })

  it('hydrates line items with unit price derived from ItemPrice/quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('OI-9001')
    expect(li.sku).toBe('TEE-S-BLUE')
    expect(li.title).toBe('Ocean Blue T-Shirt')
    expect(li.quantity).toBe(2)
    // 4998 total / 2 qty = 2499 unit price (minor units)
    expect(li.price).toEqual({ amount: 2499, currency: 'USD' })
  })

  it('maps every OrderStatus into the canonical pair of enums', () => {
    expect(mapFulfillmentStatus('Shipped')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('PartiallyShipped')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('Unshipped')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('Canceled')).toBe('UNFULFILLED')
    expect(mapFinancialStatus('Shipped')).toBe('PAID')
    expect(mapFinancialStatus('Canceled')).toBe('VOIDED')
    expect(mapFinancialStatus('PartiallyShipped')).toBe('PARTIALLY_PAID')
    expect(mapFinancialStatus('Pending')).toBe('PENDING')
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('does NOT leak buyer PII even when the raw payload contains it', () => {
    const result = transformOrder(makeOrder())
    // Canonical PII fields must be undefined — Amazon's PII policy says
    // adapters should never surface buyer email/name/address without a
    // restricted data token (which v1 does not request).
    expect(result.customerId).toBeUndefined()
    expect(result.email).toBeUndefined()
    expect(result.phone).toBeUndefined()
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
  })
})
