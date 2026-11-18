import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawNeweggOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/newegg/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawNeweggOrder> = {}): RawNeweggOrder {
  return {
    OrderNumber: 'NE-2024050100001',
    InvoiceNumber: 'INV-987654321',
    OrderDate: '05/01/2024 10:00:00',
    OrderDateInGMT: '2024-05-01T15:00:00.000Z',
    OrderStatus: 2,
    OrderStatusDescription: 'Shipped',
    CustomerName: 'John Doe',
    CustomerPhoneNumber: '+15125550100',
    CustomerEmailAddress: 'buyer@example.com',
    ShipToAddress1: '200 Tech Blvd',
    ShipToAddress2: 'Suite 300',
    ShipToCity: 'San Jose',
    ShipToState: 'CA',
    ShipToZipCode: '95110',
    ShipToCountry: 'US',
    ShipService: 'Ground',
    OrderItemAmount: 1599.99,
    ShippingAmount: 0,
    DiscountAmount: 50.00,
    SalesTax: 128.00,
    OrderTotalAmount: 1677.99,
    ItemInfoList: [
      {
        SellerPartNumber: 'GPU-RTX4090-24G',
        NeweggItemNumber: '9SIAABC12345',
        Description: 'NVIDIA GeForce RTX 4090',
        QuantityOrdered: 1,
        QuantityShipped: 1,
        UnitPrice: 1599.99,
        Status: 2,
        StatusDescription: 'Shipped',
      },
    ],
    ...overrides,
  }
}

describe('transformOrder (Newegg)', () => {
  it('maps core fields and uses OrderNumber as canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('NE-2024050100001')
    expect(result.orderNumber).toBe('INV-987654321')
    expect(result.email).toBe('buyer@example.com')
    expect(result.phone).toBe('+15125550100')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 167799, currency: 'USD' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price and sku', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('GPU-RTX4090-24G')
    expect(li.sku).toBe('GPU-RTX4090-24G')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 159999, currency: 'USD' })
  })

  it('maps pricing summary fields to canonical Money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 159999, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 12800, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 0, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 5000, currency: 'USD' })
  })

  it('maps every fulfillment status code', () => {
    expect(mapFulfillmentStatus(0)).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(1)).toBe('PARTIAL')
    expect(mapFulfillmentStatus(2)).toBe('FULFILLED')
    expect(mapFulfillmentStatus(3)).toBeUndefined()
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })

  it('maps every financial status code', () => {
    expect(mapFinancialStatus(0)).toBe('PAID')
    expect(mapFinancialStatus(1)).toBe('PAID')
    expect(mapFinancialStatus(2)).toBe('PAID')
    expect(mapFinancialStatus(3)).toBe('VOIDED')
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })

  it('extracts shipping address from flat order fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '200 Tech Blvd',
      line2: 'Suite 300',
      city: 'San Jose',
      region: 'CA',
      postalCode: '95110',
      country: 'US',
    })
  })

  it('returns undefined shippingAddress when no address fields present', () => {
    const result = transformOrder(
      makeOrder({
        ShipToAddress1: undefined,
        ShipToCity: undefined,
      }),
    )
    expect(result.shippingAddress).toBeUndefined()
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('sets cancelledAt when order status is Voided (3)', () => {
    const result = transformOrder(makeOrder({ OrderStatus: 3 }))
    expect(result.cancelledAt).toBe('2024-05-01T15:00:00.000Z')
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('uses OrderDate fallback when OrderDateInGMT is missing', () => {
    const result = transformOrder(makeOrder({ OrderDateInGMT: undefined }))
    expect(result.createdAt).toBe('05/01/2024 10:00:00')
  })

  it('handles missing ItemInfoList gracefully', () => {
    const result = transformOrder(makeOrder({ ItemInfoList: undefined }))
    expect(result.lineItems).toBeUndefined()
  })
})
