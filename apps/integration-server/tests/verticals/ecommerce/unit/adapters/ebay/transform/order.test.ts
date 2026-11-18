import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawEbayOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/ebay/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawEbayOrder> = {}): RawEbayOrder {
  return {
    orderId: '04-12345-67890',
    legacyOrderId: '110987654321',
    creationDate: '2024-05-01T10:00:00.000Z',
    lastModifiedDate: '2024-05-01T12:00:00.000Z',
    orderFulfillmentStatus: 'FULFILLED',
    orderPaymentStatus: 'PAID',
    pricingSummary: {
      priceSubtotal: { value: '39.98', currency: 'USD' },
      deliveryCost: { value: '5.99', currency: 'USD' },
      tax: { value: '3.30', currency: 'USD' },
      total: { value: '49.27', currency: 'USD' },
    },
    lineItems: [
      {
        lineItemId: 'LI-001',
        legacyItemId: '123456789012',
        title: 'Stainless Steel Widget',
        sku: 'WIDGET-001',
        quantity: 2,
        lineItemCost: { value: '39.98', currency: 'USD' },
        lineItemFulfillmentStatus: 'FULFILLED',
      },
    ],
    fulfillmentStartInstructions: [
      {
        shippingStep: {
          shipTo: {
            fullName: 'Jane Doe',
            contactAddress: {
              addressLine1: '100 Main St',
              city: 'Austin',
              stateOrProvince: 'TX',
              postalCode: '73301',
              country: 'US',
            },
            primaryPhone: { phoneNumber: '+15125550100' },
            email: 'jane@example.com',
          },
        },
      },
    ],
    salesRecordReference: 'SR-1001',
    ...overrides,
  }
}

describe('transformOrder (eBay)', () => {
  it('maps core fields and uses orderId as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('04-12345-67890')
    expect(result.orderNumber).toBe('110987654321')
    expect(result.name).toBe('SR-1001')
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toEqual({ amount: 4927, currency: 'USD' })
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('hydrates line items with unit price derived from lineItemCost/quantity', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('LI-001')
    expect(li.sku).toBe('WIDGET-001')
    expect(li.quantity).toBe(2)
    // 39.98 total / 2 qty = 19.99 unit price
    expect(li.price).toEqual({ amount: 1999, currency: 'USD' })
  })

  it('maps pricing summary fields to canonical Money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 3998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 330, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
  })

  it('maps every fulfillment and payment status', () => {
    expect(mapFulfillmentStatus('FULFILLED')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('IN_PROGRESS')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('NOT_STARTED')).toBe('UNFULFILLED')
    expect(mapFinancialStatus('PAID')).toBe('PAID')
    expect(mapFinancialStatus('PARTIALLY_REFUNDED')).toBe('PARTIALLY_REFUNDED')
    expect(mapFinancialStatus('FULLY_REFUNDED')).toBe('REFUNDED')
    expect(mapFinancialStatus('PENDING')).toBe('PENDING')
    expect(mapFinancialStatus('FAILED')).toBe('VOIDED')
  })

  it('extracts shipping address from fulfillmentStartInstructions', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: '100 Main St',
      line2: undefined,
      city: 'Austin',
      region: 'TX',
      postalCode: '73301',
      country: 'US',
    })
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(
      makeOrder({
        cancelStatus: {
          cancelState: 'CANCELED',
          cancelledDate: '2024-05-02T10:00:00.000Z',
        },
      }),
    )
    expect(result.cancelledAt).toBe('2024-05-02T10:00:00.000Z')
  })
})
