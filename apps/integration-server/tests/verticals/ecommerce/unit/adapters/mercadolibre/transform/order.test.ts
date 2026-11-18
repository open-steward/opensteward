import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawMeliOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawMeliOrder> = {}): RawMeliOrder {
  return {
    id: 4000000001,
    status: 'paid',
    status_detail: { code: 'accredited', description: 'Acreditado' },
    date_created: '2024-05-01T10:00:00.000Z',
    date_closed: '2024-05-01T10:05:00.000Z',
    last_updated: '2024-05-01T12:00:00.000Z',
    currency_id: 'ARS',
    total_amount: 45000,
    paid_amount: 45000,
    order_items: [
      {
        item: {
          id: 'MLA123456789',
          title: 'Zapatillas Nike Air Max 90',
          category_id: 'MLA1234',
          seller_sku: 'NIKE-AM90-42',
          variation_id: null,
          seller_custom_field: null,
        },
        quantity: 1,
        unit_price: 45000,
        currency_id: 'ARS',
        listing_type_id: 'gold_special',
      },
    ],
    payments: [
      {
        id: 50000001,
        order_id: 4000000001,
        status: 'approved',
        transaction_amount: 45000,
        currency_id: 'ARS',
        date_created: '2024-05-01T10:02:00.000Z',
        date_approved: '2024-05-01T10:05:00.000Z',
        payment_method_id: 'account_money',
        payment_type: 'account_money',
      },
    ],
    shipping: {
      id: 60000001,
      status: 'shipped',
      receiver_address: {
        street_name: 'Av. Corrientes',
        street_number: '1234',
        city: { name: 'Buenos Aires' },
        state: { name: 'Capital Federal' },
        country: { id: 'AR', name: 'Argentina' },
        zip_code: 'C1043AAZ',
      },
    },
    buyer: {
      id: 700001,
      nickname: 'COMPRADOR_TEST',
      first_name: 'Juan',
      last_name: 'Pérez',
      email: 'juan@example.com',
      phone: { area_code: '011', number: '12345678' },
    },
    tags: ['paid', 'not_delivered'],
    ...overrides,
  }
}

describe('transformOrder (Mercado Libre)', () => {
  it('maps core fields and uses order id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('4000000001')
    expect(result.orderNumber).toBe('4000000001')
    expect(result.name).toBe('#4000000001')
    expect(result.currency).toBe('ARS')
    expect(result.totalPrice).toEqual({ amount: 45000, currency: 'ARS' })
  })

  it('extracts buyer email and phone', () => {
    const result = transformOrder(makeOrder())
    expect(result.email).toBe('juan@example.com')
    expect(result.phone).toBe('01112345678')
  })

  it('hydrates line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('MLA123456789')
    expect(li.sku).toBe('NIKE-AM90-42')
    expect(li.quantity).toBe(1)
    expect(li.price).toEqual({ amount: 45000, currency: 'ARS' })
  })

  it('maps paid status correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.financialStatus).toBe('PAID')
  })

  it('maps shipping status to fulfillment status', () => {
    const result = transformOrder(makeOrder())
    expect(result.fulfillmentStatus).toBe('FULFILLED')
  })

  it('maps every fulfillment status', () => {
    expect(mapFulfillmentStatus('delivered')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('shipped')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('handling')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('ready_to_ship')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('pending')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('not_delivered')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus('cancelled')).toBe('RESTOCKED')
    expect(mapFulfillmentStatus('returned_to_sender')).toBe('RESTOCKED')
    expect(mapFulfillmentStatus(undefined)).toBe('UNFULFILLED')
  })

  it('maps every financial status', () => {
    expect(mapFinancialStatus('paid', [])).toBe('PAID')
    expect(mapFinancialStatus('payment_required', [])).toBe('PENDING')
    expect(mapFinancialStatus('payment_in_process', [])).toBe('PENDING')
    expect(mapFinancialStatus('partially_paid', [])).toBe('PARTIALLY_PAID')
    expect(mapFinancialStatus('cancelled', [])).toBe('VOIDED')
    expect(mapFinancialStatus('invalid', [])).toBe('VOIDED')
  })

  it('detects refunded payments', () => {
    const payments = [
      { id: 1, status: 'refunded', transaction_amount: 100, currency_id: 'ARS' },
    ]
    expect(mapFinancialStatus('paid', payments as RawMeliOrder['payments'])).toBe('REFUNDED')
  })

  it('detects partially refunded payments', () => {
    const payments = [
      { id: 1, status: 'approved', transaction_amount: 100, currency_id: 'ARS' },
      { id: 2, status: 'refunded', transaction_amount: 50, currency_id: 'ARS' },
    ]
    expect(mapFinancialStatus('paid', payments as RawMeliOrder['payments'])).toBe(
      'PARTIALLY_REFUNDED',
    )
  })

  it('extracts shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: 'Av. Corrientes 1234',
      city: 'Buenos Aires',
      region: 'Capital Federal',
      postalCode: 'C1043AAZ',
      country: 'AR',
    })
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(makeOrder({ status: 'cancelled' }))
    expect(result.cancelledAt).toBe('2024-05-01T12:00:00.000Z')
  })

  it('includes tags from ML', () => {
    const result = transformOrder(makeOrder())
    expect(result.tags).toEqual(['paid', 'not_delivered'])
  })

  it('handles coupon discounts', () => {
    const result = transformOrder(makeOrder({ coupon: { amount: 5000, id: 12345 } }))
    expect(result.totalDiscounts).toEqual({ amount: 5000, currency: 'ARS' })
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})
