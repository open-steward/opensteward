import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawDoocaOrder,
  type RawDoocaOrderLineItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/dooca-commerce/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeLineItem(overrides: Partial<RawDoocaOrderLineItem> = {}): RawDoocaOrderLineItem {
  return {
    id: 1,
    order_id: 500,
    product_id: 10,
    variation_id: 20,
    name: 'Blue T-Shirt',
    reference: 'TSHIRT-BLU',
    sku: null,
    price: '29.99',
    quantity: 2,
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawDoocaOrder> = {}): RawDoocaOrder {
  return {
    id: 500,
    code: '1001',
    status: 'open',
    payment_status: 'paid',
    fulfillment_status: 'delivered',
    total: '64.98',
    subtotal: '59.98',
    discount: '0',
    tax: '0',
    shipping: { name: 'Standard', price: '5.00' },
    customer: { id: 99, email: 'buyer@example.com.br', name: 'Ana Lima', phone: '+5511900000000' },
    address: {
      zipcode: '01310-100',
      street: 'Rua das Flores',
      number: '42',
      city: 'São Paulo',
      state: 'SP',
    },
    items: [makeLineItem()],
    discount_coupon: null,
    note: 'Leave at door',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (Dooca Commerce)', () => {
  it('maps id as string', () => {
    const result = transformOrder(makeOrder({ id: 500 }))
    expect(result.id).toBe('500')
  })

  it('maps code to orderNumber and name', () => {
    const result = transformOrder(makeOrder({ code: '1001' }))
    expect(result.orderNumber).toBe('1001')
    expect(result.name).toBe('#1001')
  })

  it('maps currency to BRL', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('BRL')
  })

  it('maps customer email and phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com.br')
    expect(result.phone).toBe('+5511900000000')
  })

  it('maps customer id from customer.id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('99')
  })

  it('maps payment_status "paid" to PAID', () => {
    const result = transformOrder(makeOrder({ payment_status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps payment_status "pending" to PENDING', () => {
    const result = transformOrder(makeOrder({ payment_status: 'pending' }))
    expect(result.financialStatus).toBe('PENDING')
  })

  it('maps payment_status "refunded" to REFUNDED', () => {
    const result = transformOrder(makeOrder({ payment_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps payment_status "approved" to AUTHORIZED', () => {
    const result = transformOrder(makeOrder({ payment_status: 'approved' }))
    expect(result.financialStatus).toBe('AUTHORIZED')
  })

  it('maps fulfillment_status "delivered" to FULFILLED', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'delivered' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps fulfillment_status "attended" to UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'attended' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps fulfillment_status "shipped" to PARTIAL', () => {
    const result = transformOrder(makeOrder({ fulfillment_status: 'shipped' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps totalPrice from total field in BRL minor units', () => {
    const result = transformOrder(makeOrder({ total: '64.98' }))
    expect(result.totalPrice).toEqual({ amount: 6498, currency: 'BRL' })
  })

  it('maps totalShipping from shipping.price in BRL minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'BRL' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('1')
    expect(li.title).toBe('Blue T-Shirt')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 2999, currency: 'BRL' })
    expect(li.productId).toBe('10')
    expect(li.variantId).toBe('20')
  })

  it('maps line item sku from reference fallback', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems![0]!.sku).toBe('TSHIRT-BLU')
  })

  it('maps shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.line1).toBe('Rua das Flores, 42')
    expect(result.shippingAddress!.city).toBe('São Paulo')
    expect(result.shippingAddress!.country).toBe('BR')
  })

  it('maps note', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Leave at door')
  })

  it('maps discount_coupon to discountCodes', () => {
    const result = transformOrder(makeOrder({ discount_coupon: 'SAVE10' }))
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Dooca Commerce)', () => {
  it('maps note', () => {
    const body = untransformOrder({ note: 'Handle with care' })
    expect(body['note']).toBe('Handle with care')
  })

  it('maps customerId to customer_id', () => {
    const body = untransformOrder({ customerId: 'cust-1' })
    expect(body['customer_id']).toBe('cust-1')
  })

  it('maps line items with price converted to major units', () => {
    const body = untransformOrder({
      lineItems: [
        { id: '1', title: 'Shirt', quantity: 1, price: { amount: 2999, currency: 'BRL' }, metadata: {} },
      ],
    })
    const items = body['items'] as Array<Record<string, unknown>>
    expect(items[0]!['price']).toBe('29.99')
    expect(items[0]!['quantity']).toBe(1)
  })
})
