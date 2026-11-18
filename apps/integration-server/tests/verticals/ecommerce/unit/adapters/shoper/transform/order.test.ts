import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawShoperOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/shoper/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeRaw(overrides: Partial<RawShoperOrder> = {}): RawShoperOrder {
  return {
    order_id: 20001,
    user_id: 201,
    email: 'jan.kowalski@example.pl',
    phone: '+48123456789',
    currency: 'PLN',
    status_id: 3,
    payment_status: 1,
    sum: '249.99',
    subtotal: '219.99',
    tax: '16.89',
    discount: '0',
    delivery_sum: '14.99',
    order_number: 'ORD-2024-001',
    delivery_address: {
      street: 'ul. Marszałkowska 100',
      apartment: 'lok. 3',
      postcode: '00-001',
      city: 'Warszawa',
      country_code: 'PL',
    },
    billing_address: {
      street: 'ul. Złota 44',
      postcode: '00-120',
      city: 'Warszawa',
      country_code: 'PL',
    },
    products: [
      {
        order_product_id: 301,
        product_id: 701,
        name: 'Laptop Biznesowy',
        quantity: 1,
        price: '219.99',
        code: 'LAP-001',
      },
    ],
    discount_code: 'PROMO10',
    notes: 'Handle with care',
    add_date: '2024-02-14T10:00:00.000Z',
    edit_date: '2024-02-15T11:00:00.000Z',
    ...overrides,
  }
}

describe('shoper transformOrder', () => {
  it('maps order_id to string id', () => {
    const result = transformOrder(makeRaw())
    expect(result.id).toBe('20001')
  })

  it('maps order_number to orderNumber string', () => {
    const result = transformOrder(makeRaw())
    expect(result.orderNumber).toBe('ORD-2024-001')
  })

  it('maps payment_status=1 to PAID financial status', () => {
    const result = transformOrder(makeRaw())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps status_id=4 to VOIDED financial status', () => {
    const result = transformOrder(makeRaw({ status_id: 4, payment_status: 0 }))
    expect(result.financialStatus).toBe('VOIDED')
  })

  it('maps status_id=3 to FULFILLED fulfillment status', () => {
    const result = transformOrder(makeRaw())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('converts sum to minor units (PLN: ×100)', () => {
    const result = transformOrder(makeRaw())
    // 249.99 PLN = 24999 gr
    expect(result.totalPrice?.amount).toBe(24999)
    expect(result.totalPrice?.currency).toBe('PLN')
  })

  it('maps shipping address (delivery_address) fields', () => {
    const result = transformOrder(makeRaw())
    expect(result.shippingAddress?.line1).toBe('ul. Marszałkowska 100')
    expect(result.shippingAddress?.city).toBe('Warszawa')
    expect(result.shippingAddress?.country).toBe('PL')
  })

  it('maps line items with minor-unit price', () => {
    const result = transformOrder(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].title).toBe('Laptop Biznesowy')
    expect(result.lineItems![0].price.amount).toBe(21999)
  })

  it('maps discount_code to discountCodes array', () => {
    const result = transformOrder(makeRaw())
    expect(result.discountCodes).toEqual(['PROMO10'])
  })

  it('produces output that passes OrderSchema', () => {
    const result = transformOrder(makeRaw())
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeRaw())
    const back = untransformOrder(canonical)
    expect(back.email).toBe('jan.kowalski@example.pl')
    expect(back.currency).toBe('PLN')
  })
})
