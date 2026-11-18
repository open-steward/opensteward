import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawEverShopOrder,
  type RawEverShopOrderItem,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrderItem(overrides: Partial<RawEverShopOrderItem> = {}): RawEverShopOrderItem {
  return {
    order_item_id: 1,
    uuid: 'item-uuid-1',
    product_id: 10,
    variant_id: 20,
    product_sku: 'SHOE-BLK-42',
    product_name: 'Black Sneaker',
    qty: 2,
    final_price: '49.99',
    discount_amount: '5.00',
    ...overrides,
  }
}

function makeOrder(overrides: Partial<RawEverShopOrder> = {}): RawEverShopOrder {
  return {
    order_id: 500,
    uuid: 'order-uuid-evershop-1',
    order_number: '2001',
    customer_id: 55,
    customer_email: 'buyer@example.com',
    customer_full_name: 'Alice Buyer',
    currency: 'USD',
    coupon: 'SAVE10',
    sub_total: '99.98',
    tax_amount: '8.99',
    discount_amount: '10.00',
    shipping_fee_incl_tax: '5.00',
    grand_total: '103.97',
    payment_status: 'paid',
    shipment_status: 'shipped',
    items: [makeOrderItem()],
    shipping_address: {
      address_1: '1234 Maple St',
      address_2: 'Apt 1',
      city: 'Los Angeles',
      province: 'CA',
      country: 'US',
      postcode: '90001',
    },
    billing_address: {
      address_1: '1234 Maple St',
      city: 'Los Angeles',
      country: 'US',
      postcode: '90001',
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformOrder(makeOrder({ uuid: 'order-uuid-evershop-1' }))
    expect(result.id).toBe('order-uuid-evershop-1')
  })

  it('falls back to string order_id when uuid is absent', () => {
    const result = transformOrder(makeOrder({ uuid: undefined }))
    expect(result.id).toBe('500')
  })

  it('maps order_number', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('2001')
  })

  it('maps name from order_number', () => {
    const result = transformOrder(makeOrder())
    expect(result.name).toBe('#2001')
  })

  it('maps customerId from customer_id', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('55')
  })

  it('maps customer_email', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('buyer@example.com')
  })

  it('maps currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('USD')
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

  it('maps shipment_status "shipped" to FULFILLED', () => {
    const result = transformOrder(makeOrder({ shipment_status: 'shipped' }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps shipment_status "not_shipped" to UNFULFILLED', () => {
    const result = transformOrder(makeOrder({ shipment_status: 'not_shipped' }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps shipment_status "partial" to PARTIAL', () => {
    const result = transformOrder(makeOrder({ shipment_status: 'partial' }))
    expect(result.fulfillmentStatus).toBe('PARTIAL')
  })

  it('maps grand_total to totalPrice in USD minor units', () => {
    const result = transformOrder(makeOrder({ grand_total: '103.97' }))
    expect(result.totalPrice).toEqual({ amount: 10397, currency: 'USD' })
  })

  it('maps shipping_fee_incl_tax to totalShipping', () => {
    const result = transformOrder(makeOrder({ shipping_fee_incl_tax: '5.00' }))
    expect(result.totalShipping).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps discount_amount to totalDiscounts', () => {
    const result = transformOrder(makeOrder({ discount_amount: '10.00' }))
    expect(result.totalDiscounts).toEqual({ amount: 1000, currency: 'USD' })
  })

  it('maps line items from items array', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('item-uuid-1')
    expect(li.title).toBe('Black Sneaker')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'USD' })
    expect(li.productId).toBe('10')
    expect(li.sku).toBe('SHOE-BLK-42')
  })

  it('maps line item discount_amount', () => {
    const result = transformOrder(makeOrder())
    const li = result.lineItems![0]!
    expect(li.totalDiscount).toEqual({ amount: 500, currency: 'USD' })
  })

  it('maps shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toBeDefined()
    expect(result.shippingAddress!.line1).toBe('1234 Maple St')
    expect(result.shippingAddress!.city).toBe('Los Angeles')
    expect(result.shippingAddress!.country).toBe('US')
  })

  it('maps coupon to discountCodes', () => {
    const result = transformOrder(makeOrder({ coupon: 'SAVE10' }))
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

describe('untransformOrder (EverShop)', () => {
  it('maps email to customer_email', () => {
    const body = untransformOrder({ email: 'test@example.com' })
    expect(body['customer_email']).toBe('test@example.com')
  })

  it('maps currency', () => {
    const body = untransformOrder({ currency: 'EUR' })
    expect(body['currency']).toBe('EUR')
  })
})
