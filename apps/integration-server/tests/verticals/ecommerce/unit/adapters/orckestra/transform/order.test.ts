import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  toFinancialStatus,
  toFulfillmentStatus,
  type RawOrckestraOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/orckestra/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawOrckestraOrder> = {}): RawOrckestraOrder {
  return {
    Id: 'order-001',
    OrderNumber: 'ON-12345',
    Status: 'New',
    Total: 129.98,
    SubTotal: 99.99,
    TaxTotal: 14.99,
    ShippingTotal: 15.00,
    DiscountTotal: 0,
    CustomerId: 'cust-abc',
    Email: 'buyer@example.com',
    PhoneNumber: '+1-555-0100',
    Currency: 'USD',
    BillingAddress: {
      Line1: '100 Commerce St',
      City: 'New York',
      RegionCode: 'NY',
      PostalCode: '10001',
      CountryCode: 'US',
    },
    Shipments: [
      {
        Id: 'ship-1',
        ShippingAddress: {
          Line1: '200 Delivery Ave',
          City: 'Brooklyn',
          RegionCode: 'NY',
          PostalCode: '11201',
          CountryCode: 'US',
        },
      },
    ],
    LineItems: [
      {
        Id: 'li-001',
        ProductId: 'prod-001',
        VariantId: null,
        ProductName: 'Orckestra Widget',
        Quantity: 2,
        CurrentPrice: 39.99,
        Sku: 'OW-001',
      },
      {
        Id: 'li-002',
        ProductId: 'prod-002',
        ProductName: { 'en-US': 'Composable Gadget' },
        Quantity: 1,
        DefaultPrice: 20.01,
        Sku: 'CG-002',
      },
    ],
    Notes: 'Leave at the door',
    CreatedDate: '2024-03-10T09:00:00Z',
    LastModifiedDate: '2024-03-12T14:00:00Z',
    CancelledDate: null,
    ...overrides,
  }
}

// ── Status mapping helpers ────────────────────────────────────────────────────

describe('toFinancialStatus', () => {
  it('maps New to PENDING', () => {
    expect(toFinancialStatus('New')).toBe('PENDING')
  })

  it('maps InProgress to PENDING', () => {
    expect(toFinancialStatus('InProgress')).toBe('PENDING')
  })

  it('maps Completed to PAID', () => {
    expect(toFinancialStatus('Completed')).toBe('PAID')
  })

  it('maps Cancelled to VOIDED', () => {
    expect(toFinancialStatus('Cancelled')).toBe('VOIDED')
  })

  it('maps Canceled (one-L variant) to VOIDED', () => {
    expect(toFinancialStatus('Canceled')).toBe('VOIDED')
  })

  it('maps null to PENDING', () => {
    expect(toFinancialStatus(null)).toBe('PENDING')
  })

  it('maps undefined to PENDING', () => {
    expect(toFinancialStatus(undefined)).toBe('PENDING')
  })

  it('maps unknown status to PENDING', () => {
    expect(toFinancialStatus('WeirdStatus')).toBe('PENDING')
  })
})

describe('toFulfillmentStatus', () => {
  it('maps New to UNFULFILLED', () => {
    expect(toFulfillmentStatus('New')).toBe('UNFULFILLED')
  })

  it('maps InProgress to PARTIAL', () => {
    expect(toFulfillmentStatus('InProgress')).toBe('PARTIAL')
  })

  it('maps Completed to FULFILLED', () => {
    expect(toFulfillmentStatus('Completed')).toBe('FULFILLED')
  })

  it('maps Cancelled to RESTOCKED', () => {
    expect(toFulfillmentStatus('Cancelled')).toBe('RESTOCKED')
  })

  it('maps Canceled (one-L variant) to RESTOCKED', () => {
    expect(toFulfillmentStatus('Canceled')).toBe('RESTOCKED')
  })

  it('maps null to UNFULFILLED', () => {
    expect(toFulfillmentStatus(null)).toBe('UNFULFILLED')
  })

  it('maps undefined to UNFULFILLED', () => {
    expect(toFulfillmentStatus(undefined)).toBe('UNFULFILLED')
  })
})

// ── transformOrder ────────────────────────────────────────────────────────────

describe('transformOrder', () => {
  it('passes canonical Order schema validation', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('maps Id to id', () => {
    const result = transformOrder(makeOrder({ Id: 'ord-xyz' }))
    expect(result.id).toBe('ord-xyz')
  })

  it('maps OrderNumber to orderNumber', () => {
    const result = transformOrder(makeOrder({ OrderNumber: 'ON-99999' }))
    expect(result.orderNumber).toBe('ON-99999')
  })

  it('maps CustomerId to customerId', () => {
    const result = transformOrder(makeOrder({ CustomerId: 'cust-789' }))
    expect(result.customerId).toBe('cust-789')
  })

  it('maps Email to email', () => {
    const result = transformOrder(makeOrder({ Email: 'test@shop.com' }))
    expect(result.email).toBe('test@shop.com')
  })

  it('maps PhoneNumber to phone', () => {
    const result = transformOrder(makeOrder({ PhoneNumber: '+1-800-555-0199' }))
    expect(result.phone).toBe('+1-800-555-0199')
  })

  it('maps Currency to currency', () => {
    const result = transformOrder(makeOrder({ Currency: 'EUR' }))
    expect(result.currency).toBe('EUR')
  })

  it('maps Total to totalPrice', () => {
    const result = transformOrder(makeOrder({ Total: 200.0, Currency: 'USD' }))
    expect(result.totalPrice).toEqual({ amount: 20000, currency: 'USD' })
  })

  it('maps SubTotal to subtotalPrice', () => {
    const result = transformOrder(makeOrder({ SubTotal: 180.0, Currency: 'USD' }))
    expect(result.subtotalPrice).toEqual({ amount: 18000, currency: 'USD' })
  })

  it('maps TaxTotal to totalTax', () => {
    const result = transformOrder(makeOrder({ TaxTotal: 20.0, Currency: 'USD' }))
    expect(result.totalTax).toEqual({ amount: 2000, currency: 'USD' })
  })

  it('maps ShippingTotal to totalShipping', () => {
    const result = transformOrder(makeOrder({ ShippingTotal: 9.99, Currency: 'USD' }))
    expect(result.totalShipping).toEqual({ amount: 999, currency: 'USD' })
  })

  it('maps DiscountTotal to totalDiscounts', () => {
    const result = transformOrder(makeOrder({ DiscountTotal: 5.0, Currency: 'USD' }))
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps New status to PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ Status: 'New' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps InProgress status to PENDING / PARTIAL', () => {
    const result = transformOrder(makeOrder({ Status: 'InProgress' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps Completed status to PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ Status: 'Completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps Cancelled status to VOIDED / RESTOCKED', () => {
    const result = transformOrder(makeOrder({ Status: 'Cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps BillingAddress correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toEqual({
      line1: '100 Commerce St',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      country: 'US',
    })
  })

  it('maps first Shipment ShippingAddress to shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '200 Delivery Ave',
      city: 'Brooklyn',
      region: 'NY',
      postalCode: '11201',
      country: 'US',
    })
  })

  it('shippingAddress is undefined when Shipments is empty', () => {
    const result = transformOrder(makeOrder({ Shipments: [] }))
    expect(result.shippingAddress).toBeUndefined()
  })

  it('billingAddress is undefined when BillingAddress is null', () => {
    const result = transformOrder(makeOrder({ BillingAddress: null }))
    expect(result.billingAddress).toBeUndefined()
  })

  it('maps LineItems to canonical lineItems', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(2)
  })

  it('lineItem id comes from LineItem.Id', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].id).toBe('li-001')
  })

  it('lineItem productId maps from ProductId', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].productId).toBe('prod-001')
  })

  it('lineItem quantity maps from Quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].quantity).toBe(2)
  })

  it('lineItem price uses CurrentPrice when available', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].price).toEqual({ amount: 3999, currency: 'USD' })
  })

  it('lineItem price falls back to DefaultPrice', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![1].price).toEqual({ amount: 2001, currency: 'USD' })
  })

  it('lineItem title resolves localized ProductName', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![1].title).toBe('Composable Gadget')
  })

  it('lineItem sku maps from Sku field', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0].sku).toBe('OW-001')
  })

  it('maps Notes to note', () => {
    const result = transformOrder(makeOrder({ Notes: 'Ring doorbell' }))
    expect(result.note).toBe('Ring doorbell')
  })

  it('maps CreatedDate to createdAt', () => {
    const result = transformOrder(makeOrder({ CreatedDate: '2024-03-10T09:00:00Z' }))
    expect(result.createdAt).toBe('2024-03-10T09:00:00Z')
  })

  it('maps LastModifiedDate to updatedAt', () => {
    const result = transformOrder(makeOrder({ LastModifiedDate: '2024-03-12T14:00:00Z' }))
    expect(result.updatedAt).toBe('2024-03-12T14:00:00Z')
  })

  it('maps CancelledDate to cancelledAt', () => {
    const result = transformOrder(
      makeOrder({ CancelledDate: '2024-03-15T10:00:00Z', Status: 'Cancelled' }),
    )
    expect(result.cancelledAt).toBe('2024-03-15T10:00:00Z')
  })

  it('cancelledAt is undefined when CancelledDate is null', () => {
    const result = transformOrder(makeOrder({ CancelledDate: null }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('carries full raw object in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect((result.metadata as Record<string, unknown>)['raw']).toEqual(raw)
  })

  it('handles missing LineItems gracefully', () => {
    const result = transformOrder(makeOrder({ LineItems: null }))
    expect(result.lineItems).toHaveLength(0)
  })

  it('handles missing Currency by defaulting to USD', () => {
    const result = transformOrder(makeOrder({ Currency: null }))
    expect(result.currency).toBe('USD')
  })

  it('handles missing Total gracefully', () => {
    const result = transformOrder(makeOrder({ Total: null }))
    expect(result.totalPrice).toBeUndefined()
  })
})
