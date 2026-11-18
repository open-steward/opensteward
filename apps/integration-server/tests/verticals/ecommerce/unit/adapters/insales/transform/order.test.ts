import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawInsalesOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawInsalesOrder> = {}): RawInsalesOrder {
  return {
    id: 3001,
    number: 1042,
    client_id: 7001,
    client: {
      id: 7001,
      name: 'Анна',
      surname: 'Иванова',
      email: 'anna@example.com',
      phone: '+79161234567',
    },
    currency: 'RUB',
    total_price: '3520.00',
    items_price: '3000.00',
    delivery_price: '350.00',
    discount_price: '180.00',
    financial_status: 'paid',
    fulfillment_status: 'delivered',
    order_lines: [
      {
        id: 9001,
        product_id: 42,
        variant_id: 501,
        title: 'Синяя футболка',
        quantity: 2,
        sale_price: '1500.00',
        total_price: '3000.00',
        sku: 'TEE-BLU-M',
      },
    ],
    shipping_address: {
      name: 'Анна Иванова',
      phone: '+79161234567',
      address: 'ул. Ленина, д. 1',
      city: 'Москва',
      state: 'Москва',
      zip: '101000',
      country: 'RU',
    },
    comment: 'Позвоните перед доставкой',
    discount_code: 'SAVE10',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    accepted_at: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformOrder (insales)', () => {
  it('maps id as string and orderNumber', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('3001')
    expect(result.orderNumber).toBe('1042')
    expect(result.name).toBe('#1042')
  })

  it('maps customerId, email, phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('7001')
    expect(result.email).toBe('anna@example.com')
    expect(result.phone).toBe('+79161234567')
  })

  it('maps currency and totalPrice in minor units', () => {
    const result = transformOrder(makeOrder())
    expect(result.currency).toBe('RUB')
    // 3520.00 RUB → 352000 minor units
    expect(result.totalPrice).toEqual({ amount: 352000, currency: 'RUB' })
  })

  it('maps paid → PAID financial status', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps delivered → FULFILLED fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps all insales financial statuses to canonical', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['approved', 'AUTHORIZED'],
      ['paid', 'PAID'],
      ['declined', 'VOIDED'],
      ['refunded', 'REFUNDED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformOrder(makeOrder({ financial_status: raw }))
      expect(result.financialStatus).toBe(expected)
    }
  })

  it('maps all insales fulfillment statuses to canonical', () => {
    const cases: [string, string][] = [
      ['new', 'UNFULFILLED'],
      ['in_progress', 'PARTIAL'],
      ['delivered', 'FULFILLED'],
      ['cancelled', 'RESTOCKED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformOrder(makeOrder({ fulfillment_status: raw }))
      expect(result.fulfillmentStatus).toBe(expected)
    }
  })

  it('maps money fields in minor units', () => {
    const result = transformOrder(makeOrder())
    // items_price 3000 → 300000
    expect(result.subtotalPrice).toEqual({ amount: 300000, currency: 'RUB' })
    // delivery_price 350 → 35000
    expect(result.totalShipping).toEqual({ amount: 35000, currency: 'RUB' })
    // discount_price 180 → 18000
    expect(result.totalDiscounts).toEqual({ amount: 18000, currency: 'RUB' })
  })

  it('maps line items', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('501')
    expect(li.title).toBe('Синяя футболка')
    expect(li.quantity).toBe(2)
    // sale_price 1500.00 → 150000
    expect(li.price).toEqual({ amount: 150000, currency: 'RUB' })
    expect(li.sku).toBe('TEE-BLU-M')
  })

  it('maps shippingAddress', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress?.line1).toBe('ул. Ленина, д. 1')
    expect(result.shippingAddress?.city).toBe('Москва')
    expect(result.shippingAddress?.postalCode).toBe('101000')
    expect(result.shippingAddress?.country).toBe('RU')
  })

  it('maps note from comment and discountCodes', () => {
    const result = transformOrder(makeOrder())
    expect(result.note).toBe('Позвоните перед доставкой')
    expect(result.discountCodes).toEqual(['SAVE10'])
  })

  it('maps processedAt from accepted_at', () => {
    const result = transformOrder(makeOrder())
    expect(result.processedAt).toBe('2024-03-01T01:00:00Z')
  })

  it('defaults currency to RUB when not set', () => {
    const result = transformOrder(makeOrder({ currency: null }))
    expect(result.currency).toBe('RUB')
  })

  it('resolves customerId from client.id when client_id is null', () => {
    const result = transformOrder(makeOrder({ client_id: null }))
    expect(result.customerId).toBe('7001')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['comment']).toBe('Позвоните перед доставкой')
  })
})
