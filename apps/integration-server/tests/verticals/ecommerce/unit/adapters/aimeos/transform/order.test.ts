import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type AimeosOrder,
  type AimeosOrderBase,
  type AimeosOrderProduct,
  type AimeosAddress,
} from '../../../../../../../src/verticals/ecommerce/adapters/aimeos/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeOrderProduct(
  overrides: Partial<AimeosOrderProduct['attributes']> = {},
): AimeosOrderProduct {
  return {
    type: 'order/base/product',
    id: 'li-001',
    attributes: {
      'order.base.product.id': 'li-001',
      'order.base.product.name': 'Blue T-Shirt',
      'order.base.product.quantity': 2,
      'order.base.product.price': '29.99',
      'order.base.product.currencyid': 'EUR',
      'order.base.product.productid': 'prod-001',
      'order.base.product.prodcode': 'TSHIRT-BLU',
      ...overrides,
    },
  }
}

function makeOrderBase(
  overrides: Partial<AimeosOrderBase['attributes']> = {},
): AimeosOrderBase {
  return {
    type: 'order/base',
    id: 'base-001',
    attributes: {
      'order.base.id': 'base-001',
      'order.base.price': '69.98',
      'order.base.costs': '5.00',
      'order.base.currencyid': 'EUR',
      'order.base.customerid': 'cust-001',
      'order.base.email': 'customer@example.com',
      'order.base.comment': 'Please gift wrap',
      'order.base.ctime': '2024-06-01T00:00:00+00:00',
      'order.base.mtime': '2024-06-02T00:00:00+00:00',
      ...overrides,
    },
  }
}

function makeShippingAddress(
  overrides: Partial<AimeosAddress['attributes']> = {},
): AimeosAddress {
  return {
    type: 'order/base/address',
    id: 'addr-001',
    attributes: {
      'order.base.address.address1': '123 Main St',
      'order.base.address.address2': 'Apt 4',
      'order.base.address.city': 'Berlin',
      'order.base.address.state': 'BE',
      'order.base.address.postal': '10115',
      'order.base.address.countryid': 'DE',
      ...overrides,
    },
  }
}

function makeOrder(overrides: Partial<AimeosOrder['attributes']> = {}): AimeosOrder {
  return {
    type: 'order',
    id: 'order-001',
    attributes: {
      'order.id': 'order-001',
      'order.baseid': 'base-001',
      'order.statusdelivery': 3,
      'order.statuspayment': 6,
      'order.datepayment': '2024-06-01T10:00:00+00:00',
      'order.ctime': '2024-06-01T00:00:00+00:00',
      'order.mtime': '2024-06-02T00:00:00+00:00',
      ...overrides,
    },
  }
}

// ── transformOrder ────────────────────────────────────────────────────────────

describe('transformOrder (Aimeos)', () => {
  it('maps core order id and timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('order-001')
    expect(result.orderNumber).toBe('order-001')
    expect(result.name).toBe('#order-001')
    expect(result.createdAt).toBe('2024-06-01T00:00:00+00:00')
    expect(result.updatedAt).toBe('2024-06-02T00:00:00+00:00')
  })

  it('maps customer email and currency from base', () => {
    const result = transformOrder(makeOrder(), makeOrderBase())
    expect(result.email).toBe('customer@example.com')
    expect(result.currency).toBe('EUR')
    expect(result.customerId).toBe('cust-001')
  })

  it('maps total price from base', () => {
    const result = transformOrder(makeOrder(), makeOrderBase())
    expect(result.totalPrice).toEqual({ amount: 6998, currency: 'EUR' })
  })

  it('maps shipping cost from base costs field', () => {
    const result = transformOrder(makeOrder(), makeOrderBase())
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('maps payment status 6 (received) to PAID', () => {
    const result = transformOrder(makeOrder({ 'order.statuspayment': 6 }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps payment status 5 (authorized) to AUTHORIZED', () => {
    const result = transformOrder(makeOrder({ 'order.statuspayment': 5 }))
    expect(result.financialStatus).toBe('AUTHORIZED')
  })

  it('maps payment status 4 (pending) to PENDING', () => {
    const result = transformOrder(makeOrder({ 'order.statuspayment': 4 }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps payment status 3 (refunded) to REFUNDED', () => {
    const result = transformOrder(makeOrder({ 'order.statuspayment': 3 }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps delivery status 4 (delivered) to FULFILLED', () => {
    const result = transformOrder(makeOrder({ 'order.statusdelivery': 4 }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps delivery status 3 (dispatch) to PARTIAL', () => {
    const result = transformOrder(makeOrder({ 'order.statusdelivery': 3 }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps delivery status 1 (waiting) to UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ 'order.statusdelivery': 1 }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps delivery status 7 (returned) to RESTOCKED', () => {
    const result = transformOrder(makeOrder({ 'order.statusdelivery': 7 }))
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('sets cancelledAt when payment status indicates canceled', () => {
    const result = transformOrder(
      makeOrder({ 'order.statuspayment': 1 }),
    )
    expect(result.cancelledAt).toBeDefined()
  })

  it('does not set cancelledAt for normal orders', () => {
    const result = transformOrder(makeOrder())
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps line items from included products', () => {
    const item = makeOrderProduct()
    const result = transformOrder(makeOrder(), makeOrderBase(), [item])
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'EUR' })
    expect(li.productId).toBe('prod-001')
    expect(li.sku).toBe('TSHIRT-BLU')
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder(), makeOrderBase(), undefined, makeShippingAddress())
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.line1).toBe('123 Main St')
    expect(result.shippingAddress!.city).toBe('Berlin')
    expect(result.shippingAddress!.country).toBe('DE')
  })

  it('handles address with no fields returning undefined', () => {
    const emptyAddr: AimeosAddress = {
      type: 'order/base/address',
      id: 'addr-empty',
      attributes: {},
    }
    const result = transformOrder(makeOrder(), makeOrderBase(), undefined, emptyAddr)
    expect(result.shippingAddress).toBeUndefined()
  })

  it('maps order note from base comment', () => {
    const result = transformOrder(makeOrder(), makeOrderBase())
    expect(result.note).toBe('Please gift wrap')
  })

  it('handles missing base gracefully', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
    expect(result.totalPrice).toBeUndefined()
    expect(result.email).toBeUndefined()
  })

  it('handles line item with string quantity', () => {
    const item = makeOrderProduct({ 'order.base.product.quantity': '3' })
    const result = transformOrder(makeOrder(), makeOrderBase(), [item])
    expect(result.lineItems![0]!.quantity).toBe(3)
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder(), makeOrderBase(), [makeOrderProduct()])
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})
