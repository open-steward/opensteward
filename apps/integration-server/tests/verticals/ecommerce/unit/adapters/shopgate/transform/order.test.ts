import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShopgateOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopgate/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawShopgateOrder> = {}): RawShopgateOrder {
  return {
    orderNumber: 'SO-2024-001',
    externalOrderNumber: 'EXT-42',
    customerId: 'cust-001',
    currencyCode: 'USD',
    paymentStatus: 'paid',
    fulfillmentStatus: 'fulfilled',
    subTotal: '89.99',
    taxAmount: '8.10',
    shippingAmount: '5.99',
    discountAmount: '0',
    total: '104.08',
    lineItems: [
      {
        id: 'li-001',
        productCode: 'PROD-001',
        variantCode: 'VAR-001',
        name: 'Widget Pro',
        quantity: 2,
        unitPrice: '44.99',
        currency: 'USD',
        sku: 'WGT-PRO-001',
      },
    ],
    addressSequences: [
      {
        firstName: 'John',
        lastName: 'Doe',
        street1: '1 Billing Ave',
        city: 'New York',
        state: 'NY',
        zip: '10001',
        countryCode: 'US',
      },
      {
        firstName: 'John',
        lastName: 'Doe',
        street1: '2 Ship Lane',
        city: 'Brooklyn',
        state: 'NY',
        zip: '11201',
        countryCode: 'US',
      },
    ],
    primaryBillToAddressSequenceIndex: 0,
    primaryShipToAddressSequenceIndex: 1,
    notes: 'Leave at door',
    tags: ['priority', 'gift'],
    submitDate: '2024-03-15T10:00:00.000Z',
    createdAt: '2024-03-15T10:00:00.000Z',
    updatedAt: '2024-03-16T08:00:00.000Z',
    ...overrides,
  }
}

describe('shopgate transformOrder', () => {
  it('maps orderNumber to id', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('SO-2024-001')
  })

  it('maps externalOrderNumber to name', () => {
    const result = transformOrder(makeRaw())
    expect(result.name).toBe('EXT-42')
  })

  it('maps paymentStatus to financialStatus via FIN_STATUS_MAP', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps fulfillmentStatus to FULFILLED', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps in_progress fulfillmentStatus to PARTIAL', () => {
    const result = transformOrder(makeRaw({ fulfillmentStatus: 'in_progress' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('converts total to minor units (USD: ×100)', () => {
    const result = transformOrder(makeRaw())
    // 104.08 USD = 10408 cents
    expect(result.totalPrice?.amount).toBe(10408)
    expect(result.totalPrice?.currency).toBe('USD')
  })

  it('maps line item unitPrice to minor units', () => {
    const result = transformOrder(makeRaw())
    // 44.99 USD = 4499 cents
    expect(result.lineItems![0].price.amount).toBe(4499)
    expect(result.lineItems![0].title).toBe('Widget Pro')
  })

  it('maps billing address (index 0) and shipping address (index 1)', () => {
    const result = transformOrder(makeRaw())
    expect(result.billingAddress?.line1).toBe('1 Billing Ave')
    expect(result.shippingAddress?.line1).toBe('2 Ship Lane')
  })

  it('maps tags array', () => {
    const result = transformOrder(makeRaw())
    expect(result.tags).toEqual(['priority', 'gift'])
  })

  it('produces output that passes OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeRaw())
    const back = untransformOrder(canonical)
    expect(back.currencyCode).toBe('USD')
    expect(back.notes).toBe('Leave at door')
  })
})
