import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawZidOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawZidOrder> = {}): RawZidOrder {
  return {
    id: 8001,
    invoice_number: 1042,
    code: 'ZID-1042',
    currency_code: 'SAR',
    order_status: { code: 'delivered', name: 'Delivered' },
    payment_status: 'paid',
    customer: {
      id: 7001,
      name: 'Ahmed Al-Rashid',
      email: 'ahmed@example.sa',
      mobile: '+966500000001',
    },
    products: [
      {
        id: 301,
        name: 'Arabic Coffee Set',
        sku: 'ACS-001',
        quantity: 2,
        price: '120.00',
        total: '240.00',
      },
    ],
    shipping: {
      address: {
        line_1: 'King Fahd Road',
        city_name: 'Riyadh',
        country_code: 'SA',
        postcode: '12211',
      },
      method: { name: 'Aramex', id: 3 },
      tracking_number: 'SA1234567890',
    },
    order_total: '240.00',
    coupon: { code: 'SUMMER10' },
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-01-17T16:45:00Z',
    ...overrides,
  }
}

describe('transformOrder (Zid)', () => {
  it('maps numeric id to string', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('8001')
  })

  it('maps invoice_number to orderNumber as string', () => {
    const result = transformOrder(makeOrder())
    expect(result.orderNumber).toBe('1042')
  })

  it('maps code to name', () => {
    const result = transformOrder(makeOrder())
    expect(result.name).toBe('ZID-1042')
  })

  it('maps currency_code to currency', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('SAR')
  })

  it('maps delivered order_status to FULFILLED fulfillmentStatus', () => {
    const result = transformOrder(makeOrder({ order_status: { code: 'delivered' } }))
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps new order_status to UNFULFILLED fulfillmentStatus', () => {
    const result = transformOrder(makeOrder({ order_status: { code: 'new' } }))
    expect(result.fulfillmentStatus).toBe('UNFULFILLED')
  })

  it('maps preparing/indelivery to PARTIAL fulfillmentStatus', () => {
    expect(
      transformOrder(makeOrder({ order_status: { code: 'preparing' } })).fulfillmentStatus,
    ).toBe('PARTIAL')
    expect(
      transformOrder(makeOrder({ order_status: { code: 'indelivery' } })).fulfillmentStatus,
    ).toBe('PARTIAL')
  })

  it('maps canceled order_status to RESTOCKED fulfillmentStatus', () => {
    const result = transformOrder(makeOrder({ order_status: { code: 'canceled' } }))
    expect(result.fulfillmentStatus).toBe('RESTOCKED')
  })

  it('maps paid payment_status to PAID financialStatus', () => {
    const result = transformOrder(makeOrder({ payment_status: 'paid' }))
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps refunded payment_status to REFUNDED financialStatus', () => {
    const result = transformOrder(makeOrder({ payment_status: 'refunded' }))
    expect(result.financialStatus).toBe('REFUNDED')
  })

  it('maps voided payment_status to VOIDED financialStatus', () => {
    const result = transformOrder(makeOrder({ payment_status: 'voided' }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps customer to customerId, email, phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('ahmed@example.sa')
    expect(result.phone).toBe('+966500000001')
  })

  it('converts major-unit order_total to minor units (SAR × 100)', () => {
    const result = transformOrder(makeOrder())
    // 240 SAR = 24000 halalas
    expect(result.totalPrice).toEqual({ amount: 24000, currency: 'SAR' })
  })

  it('maps line items with price in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('301')
    expect(li.title).toBe('Arabic Coffee Set')
    expect(li.sku).toBe('ACS-001')
    expect(li.quantity).toBe(2)
    // 120 SAR = 12000 halalas
    expect(li.price).toEqual({ amount: 12000, currency: 'SAR' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: 'King Fahd Road',
      city: 'Riyadh',
      country: 'SA',
      postalCode: '12211',
    })
  })

  it('maps coupon code to discountCodes', () => {
    const result = transformOrder(makeOrder())
    expect(result.discountCodes).toEqual(['SUMMER10'])
  })

  it('maps created_at and updated_at', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2026-01-17T16:45:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying OrderSchema', () => {
    const result = transformOrder(makeOrder())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })
})

describe('untransformOrder (Zid)', () => {
  it('maps currency to currency_code', () => {
    const body = untransformOrder({ currency: 'SAR' })
    expect(body.currency_code).toBe('SAR')
  })

  it('maps lineItems to products with sku and quantity', () => {
    const body = untransformOrder({
      lineItems: [
        {
          id: '1',
          title: 'Coffee',
          quantity: 2,
          sku: 'ACS-001',
          price: { amount: 24000, currency: 'SAR' },
          metadata: {},
        },
      ],
    })
    const products = body.products as Array<{ sku: string; quantity: number }>
    expect(products).toHaveLength(1)
    expect(products[0]!.sku).toBe('ACS-001')
    expect(products[0]!.quantity).toBe(2)
  })
})
