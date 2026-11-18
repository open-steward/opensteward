import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawVolusionOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/volusion/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawVolusionOrder> = {}): RawVolusionOrder {
  return {
    OrderID: 4001,
    OrderNumber: 4001,
    CustomerID: 3001,
    CustomerEmail: 'jane@example.com',
    CustomerPhone: '+1 555 123 4567',
    Currency: 'USD',
    SubTotal: 100.0,
    TotalTax: 8.25,
    TotalDiscount: 5.0,
    TotalShipping: 7.99,
    GrandTotal: 111.24,
    PaymentStatus: 'Paid',
    ShipmentStatus: 'Shipped',
    OrderDetails: [
      {
        OrderDetailID: 9001,
        ProductID: 5001,
        ProductCode: 'TSHIRT-BLU-S',
        ProductName: 'Blue T-Shirt - Small',
        Quantity: 2,
        UnitPrice: 29.99,
        TotalPrice: 59.98,
      },
    ],
    BillingAddress: {
      Address1: '100 Main St',
      City: 'Austin',
      State: 'TX',
      PostalCode: '73301',
      Country: 'US',
    },
    ShippingAddress: {
      Address1: '100 Main St',
      City: 'Austin',
      State: 'TX',
      PostalCode: '73301',
      Country: 'US',
    },
    CouponCode: 'SAVE5',
    OrderNotes: 'Gift wrap please',
    DateCreated: '2024-05-01T10:00:00Z',
    LastModified: '2024-05-01T12:00:00Z',
    ...overrides,
  }
}

describe('transformOrder', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('4001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('4001')
    expect(result.customerId).toBe('3001')
    expect(result.email).toBe('jane@example.com')
    expect(result.currency).toBe('USD')
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 11124, currency: 'USD' })
    expect(result.totalShipping).toEqual({ amount: 799, currency: 'USD' })
  })

  it('maps nested line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('5001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'USD' })
    expect(li.sku).toBe('TSHIRT-BLU-S')
  })

  it('maps addresses and discount codes', () => {
    const result = transformOrder(makeOrder())
    expect(result.billingAddress?.line1).toBe('100 Main St')
    expect(result.shippingAddress?.postalCode).toBe('73301')
    expect(result.discountCodes).toEqual(['SAVE5'])
    expect(result.note).toBe('Gift wrap please')
  })

  it('maps unfulfilled status for not_shipped', () => {
    const result = transformOrder(makeOrder({ ShipmentStatus: 'Not_Shipped' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps partial fulfillment', () => {
    const result = transformOrder(makeOrder({ ShipmentStatus: 'Partially_Shipped' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
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

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const raw = untransformOrder(canonical)
    expect(raw.CustomerEmail).toBe('jane@example.com')
    expect(raw.Currency).toBe('USD')
    expect(raw.OrderNotes).toBe('Gift wrap please')
    expect(raw.CouponCode).toBe('SAVE5')
  })
})
