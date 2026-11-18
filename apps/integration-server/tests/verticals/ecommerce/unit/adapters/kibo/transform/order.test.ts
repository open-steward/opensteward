import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawKiboOrder,
  type RawKiboLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/kibo/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawKiboOrder> = {}): RawKiboOrder {
  return {
    id: 'kibo-order-001',
    orderNumber: 1001,
    status: 'Accepted',
    submittedDate: '2024-05-01T10:00:00Z',
    lastModifiedDate: '2024-05-02T12:00:00Z',
    email: 'customer@example.com',
    total: 249.98,
    subtotal: 219.98,
    taxTotal: 20.00,
    shippingTotal: 10.00,
    discountTotal: 0,
    currencyCode: 'USD',
    userId: 'user-abc-123',
    billingInfo: {
      billingContact: {
        firstName: 'John',
        lastNameOrSurname: 'Doe',
        address: {
          address1: '100 Main St',
          cityOrTown: 'Springfield',
          stateOrProvince: 'IL',
          postalOrZipCode: '62701',
          countryCode: 'US',
        },
      },
    },
    fulfillmentInfo: {
      fulfillmentContact: {
        firstName: 'John',
        lastNameOrSurname: 'Doe',
        address: {
          address1: '100 Main St',
          address2: 'Apt 4B',
          cityOrTown: 'Springfield',
          stateOrProvince: 'IL',
          postalOrZipCode: '62701',
          countryCode: 'US',
        },
      },
    },
    items: [
      {
        id: 'item-001',
        productCode: 'KIBO-001',
        variationProductCode: 'KIBO-001-BLK-SM',
        name: 'Kibo Smart Speaker - Black / Small',
        quantity: 1,
        unitPrice: { listAmount: 149.99, saleAmount: 129.99 },
        total: 129.99,
        discountTotal: 0,
        sku: 'KIBO-001-BLK-SM',
      },
      {
        id: 'item-002',
        productCode: 'KIBO-CABLE',
        name: 'USB-C Cable',
        quantity: 2,
        unitPrice: { listAmount: 14.99, saleAmount: 11.99 },
        total: 23.98,
        discountTotal: 6.00,
        sku: 'USB-CABLE-001',
      },
    ],
    discountCodes: ['SAVE10'],
    notes: [{ text: 'Please gift wrap' }],
    ...overrides,
  }
}

// ── Core fields ───────────────────────────────────────────────────────────────

describe('transformOrder (Kibo)', () => {
  it('maps core fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('kibo-order-001')
    expect(result.orderNumber).toBe('1001')
    expect(result.email).toBe('customer@example.com')
    expect(result.customerId).toBe('user-abc-123')
    expect(result.currency).toBe('USD')
    expect(result.createdAt).toBe('2024-05-01T10:00:00Z')
    expect(result.updatedAt).toBe('2024-05-02T12:00:00Z')
  })

  it('maps money fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 24998, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 21998, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 2000, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 1000, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 0, currency: 'USD' })
  })

  // ── Status mapping ─────────────────────────────────────────────────────────

  it('maps Pending → PENDING / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'Pending' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Accepted → PENDING / PARTIAL', () => {
    const result = transformOrder(makeOrder({ status: 'Accepted' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps Processing → PENDING / PARTIAL', () => {
    const result = transformOrder(makeOrder({ status: 'Processing' }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps Fulfilled → PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'Fulfilled' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps Completed → PAID / FULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'Completed' }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps Cancelled → VOIDED / UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ status: 'Cancelled' }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps Returned → REFUNDED / CANCELLED', () => {
    const result = transformOrder(makeOrder({ status: 'Returned' }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  // ── Addresses ─────────────────────────────────────────────────────────────

  it('maps billing address', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.line1).toBe('100 Main St')
    expect(result.billingAddress!.city).toBe('Springfield')
    expect(result.billingAddress!.region).toBe('IL')
    expect(result.billingAddress!.postalCode).toBe('62701')
    expect(result.billingAddress!.country).toBe('US')
  })

  it('maps shipping address with line2', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.line2).toBe('Apt 4B')
  })

  it('returns undefined addresses when no contact address', () => {
    const result = transformOrder(makeOrder({ billingInfo: {}, fulfillmentInfo: {} }))
    expect(result.billingAddress).toBeUndefined()
    expect(result.shippingAddress).toBeUndefined()
  })

  // ── Line items ─────────────────────────────────────────────────────────────

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(2)
    const item = result.lineItems![0]!
    expect(item.id).toBe('item-001')
    expect(item.productId).toBe('KIBO-001')
    expect(item.variantId).toBe('KIBO-001-BLK-SM')
    expect(item.title).toBe('Kibo Smart Speaker - Black / Small')
    expect(item.quantity).toBe(1)
    expect(item.price).toEqual({ amount: 12999, currency: 'USD' })
    expect(item.sku).toBe('KIBO-001-BLK-SM')
  })

  it('maps line item discount', () => {
    const result = transformOrder(makeOrder())
    const item = result.lineItems![1]!
    expect(item.totalDiscount).toEqual({ amount: 600, currency: 'USD' })
  })

  it('returns undefined lineItems when items array is empty', () => {
    const result = transformOrder(makeOrder({ items: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  // ── Additional fields ──────────────────────────────────────────────────────

  it('maps discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps first note text', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
  })

  it('maps cancelledDate', () => {
    const result = transformOrder(makeOrder({ cancelledDate: '2024-05-03T10:00:00Z', status: 'Cancelled' }))
    expect(result.cancelledAt).toBe('2024-05-03T10:00:00Z')
  })

  it('defaults currency to USD when missing', () => {
    const result = transformOrder(makeOrder({ currencyCode: undefined }))
    expect(result.currency).toBe('USD')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles empty order object', () => {
    const result = transformOrder({})
    expect(result.id).toBe('')
    expect(result.currency).toBe('USD')
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
