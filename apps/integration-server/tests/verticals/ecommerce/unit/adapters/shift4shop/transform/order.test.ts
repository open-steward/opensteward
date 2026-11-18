import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type RawShift4ShopOrder,
  type RawShift4ShopOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/shift4shop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderItem(overrides: Partial<RawShift4ShopOrderItem> = {}): RawShift4ShopOrderItem {
  return {
    ItemIndexID: 9001,
    CatalogID: 42,
    CatalogIDVariant: 101,
    ItemDescription: 'Classic Red Shirt',
    ItemQuantity: 2,
    ItemUnitPrice: 24.99,
    ItemSalePrice: 22.99,
    ItemOptionCode: 'SHIRT-S-RED',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawShift4ShopOrder> = {}): RawShift4ShopOrder {
  return {
    InvoiceNumberPrefix: 'ORD',
    InvoiceNumber: 1001,
    CustomerID: 7001,
    OrderStatusID: 3,
    OrderDate: '2024-05-01T10:00:00.000Z',
    LastUpdate: '2024-05-01T12:00:00.000Z',
    OrderAmount: 55.97,
    TaxCost: 4.99,
    ShipCost: 5.99,
    DiscountAmt: 2.00,
    Subtotal: 45.98,
    CurrencyCode: 'USD',
    CustomerEmail: 'buyer@example.com',
    CustomerPhone: '+1-555-0100',
    Notes: 'Please gift wrap',
    BillingAddress: {
      FirstName: 'Jane',
      LastName: 'Doe',
      Address: '123 Main St',
      Address2: 'Apt 4',
      City: 'Springfield',
      State: 'IL',
      Zip: '62701',
      Country: 'US',
      Phone: '+1-555-0100',
    },
    ShipmentList: [
      {
        ShipmentID: 8001,
        ShipmentTrackingCode: '1Z999AA10123456784',
        ShipmentMethodName: 'UPS Ground',
        ShipmentDate: '2024-05-02T00:00:00.000Z',
      },
    ],
    OrderItemList: [makeOrderItem()],
    ...overrides,
  }
}

describe('transformOrder (Shift4Shop)', () => {
  it('maps core fields and concatenates prefix+number into id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('ORD1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#ORD1001')
    expect(result.customerId).toBe('7001')
    expect(result.currency).toBe('USD')
  })

  it('maps email and phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com')
    expect(result.phone).toBe('+1-555-0100')
  })

  it('maps financial and fulfillment status for status 1 (New)', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 1 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status 2 (Processing) → PENDING/PARTIAL', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 2 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps status 3 (Shipped) → PAID/FULFILLED', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 3 }))
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps status 4 (Cancelled) → VOIDED/RESTOCKED', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 4 }))
    expect(result.financialStatus).toBe('VOIDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps status 5 (On Hold) → PENDING/UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 5 }))
    expect(result.financialStatus).toBe('PENDING')
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps status 6 (Returned) → REFUNDED/RESTOCKED', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 6 }))
    expect(result.financialStatus).toBe('REFUNDED')
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps all monetary fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalPrice).toEqual({ amount: 5597, currency: 'USD' })
    expect(result.subtotalPrice).toEqual({ amount: 4598, currency: 'USD' })
    expect(result.totalTax).toEqual({ amount: 499, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 599, currency: 'USD' })
    expect(result.totalDiscounts).toEqual({ amount: 200, currency: 'USD' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('101')
    expect(li.title).toBe('Classic Red Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2299, currency: 'USD' })
    expect(li.sku).toBe('SHIRT-S-RED')
  })

  it('maps billing address fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress).toBeDefined()
    expect(result.billingAddress!.line1).toBe('123 Main St')
    expect(result.billingAddress!.line2).toBe('Apt 4')
    expect(result.billingAddress!.city).toBe('Springfield')
    expect(result.billingAddress!.region).toBe('IL')
    expect(result.billingAddress!.postalCode).toBe('62701')
    expect(result.billingAddress!.country).toBe('US')
  })

  it('maps fulfillmentIds from ShipmentList', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentIds).toEqual(['8001'])
  })

  it('maps note field', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Please gift wrap')
  })

  it('sets cancelledAt when status is 4', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 4, CancelledDate: '2024-05-03T00:00:00.000Z' }))
    expect(result.cancelledAt).toBe('2024-05-03T00:00:00.000Z')
  })

  it('does not set cancelledAt for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 3 }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T12:00:00.000Z')
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

  it('handles order with no line items gracefully', () => {
    const result = transformOrder(makeOrder({ OrderItemList: [] }))
    expect(result.lineItems).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('handles order with no prefix (numeric id only)', () => {
    const result = transformOrder(makeOrder({ InvoiceNumberPrefix: null, InvoiceNumber: 999 }))
    expect(result.id).toBe('999')
    expect(result.orderNumber).toBe('999')
  })

  it('handles unknown status gracefully (no crash)', () => {
    const result = transformOrder(makeOrder({ OrderStatusID: 99 }))
    expect(result.financialStatus).toBeUndefined()
    expect(result.fulfillmentStatus).toBeUndefined()
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('falls back to ItemUnitPrice when ItemSalePrice is absent', () => {
    const item = makeOrderItem({ ItemSalePrice: undefined })
    const result = transformOrder(makeOrder({ OrderItemList: [item] }))
    expect(result.lineItems![0]!.price.amount).toBe(2499)
  })
})
