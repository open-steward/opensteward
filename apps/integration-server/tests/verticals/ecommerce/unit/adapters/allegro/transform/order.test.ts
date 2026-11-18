import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  mapFinancialStatus,
  mapFulfillmentStatus,
  type RawAllegroCheckoutForm,
} from '../../../../../../../src/verticals/ecommerce/adapters/allegro/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawAllegroCheckoutForm> = {}): RawAllegroCheckoutForm {
  return {
    id: 'cf-12345-abcde',
    buyer: {
      id: 'buyer-001',
      email: 'jan@example.pl',
      login: 'jan_kowalski',
      firstName: 'Jan',
      lastName: 'Kowalski',
      phoneNumber: '+48501234567',
    },
    lineItems: [
      {
        id: 'li-001',
        offer: {
          id: 'offer-123',
          name: 'Polska Drewniana Szkatulka',
          external: { id: 'SKU-001' },
        },
        quantity: 2,
        price: { amount: '49.99', currency: 'PLN' },
      },
    ],
    delivery: {
      address: {
        street: 'ul. Marszalkowska 10',
        city: 'Warszawa',
        postCode: '00-001',
        countryCode: 'PL',
      },
      method: { id: 'inpost-locker', name: 'InPost Paczkomat' },
      cost: { amount: '8.99', currency: 'PLN' },
    },
    payment: {
      id: 'pay-001',
      type: 'ONLINE',
      provider: 'P24',
      paidAmount: { amount: '108.97', currency: 'PLN' },
    },
    summary: {
      totalToPay: { amount: '108.97', currency: 'PLN' },
    },
    status: 'READY_FOR_PROCESSING',
    fulfillment: {
      status: 'NEW',
    },
    boughtAt: '2024-05-01T10:00:00.000Z',
    updatedAt: '2024-05-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (Allegro)', () => {
  it('maps core fields and uses checkout form id as the canonical id', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('cf-12345-abcde')
    expect(result.orderNumber).toBe('cf-12345-abcde')
    expect(result.currency).toBe('PLN')
    expect(result.totalPrice).toEqual({ amount: 10897, currency: 'PLN' })
  })

  it('maps buyer info to customer fields', () => {
    const result = transformOrder(makeOrder())
    expect(result.customerId).toBe('buyer-001')
    expect(result.email).toBe('jan@example.pl')
    expect(result.phone).toBe('+48501234567')
  })

  it('hydrates line items with price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('li-001')
    expect(li.productId).toBe('offer-123')
    expect(li.title).toBe('Polska Drewniana Szkatulka')
    expect(li.sku).toBe('SKU-001')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'PLN' })
  })

  it('maps shipping address', () => {
    const result = transformOrder(makeOrder())
    expect(result.shippingAddress).toEqual({
      line1: 'ul. Marszalkowska 10',
      city: 'Warszawa',
      postalCode: '00-001',
      country: 'PL',
    })
  })

  it('maps shipping cost', () => {
    const result = transformOrder(makeOrder())
    expect(result.totalShipping).toEqual({ amount: 899, currency: 'PLN' })
  })

  it('computes subtotal from line items', () => {
    const result = transformOrder(makeOrder())
    // 4999 * 2 = 9998
    expect(result.subtotalPrice).toEqual({ amount: 9998, currency: 'PLN' })
  })

  it('maps every fulfillment status', () => {
    expect(mapFulfillmentStatus('SENT')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('PICKED_UP')).toBe('FULFILLED')
    expect(mapFulfillmentStatus('READY_FOR_SHIPMENT')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('PROCESSING')).toBe('PARTIAL')
    expect(mapFulfillmentStatus('NEW')).toBe('UNFULFILLED')
    expect(mapFulfillmentStatus(undefined)).toBeUndefined()
  })

  it('maps every financial status', () => {
    expect(mapFinancialStatus('BOUGHT_AND_PAID')).toBe('PAID')
    expect(mapFinancialStatus('FILLED_IN')).toBe('PAID')
    expect(mapFinancialStatus('READY_FOR_PROCESSING')).toBe('PAID')
    expect(mapFinancialStatus('CANCELLED')).toBe('VOIDED')
    expect(mapFinancialStatus('SOME_OTHER')).toBe('PENDING')
    expect(mapFinancialStatus(undefined)).toBeUndefined()
  })

  it('surfaces timestamps', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T12:00:00.000Z')
    expect(result.processedAt).toBe('2024-05-01T10:00:00.000Z')
  })

  it('sets cancelledAt when order is cancelled', () => {
    const result = transformOrder(
      makeOrder({
        status: 'CANCELLED',
        updatedAt: '2024-05-02T10:00:00.000Z',
      }),
    )
    expect(result.cancelledAt).toBe('2024-05-02T10:00:00.000Z')
  })

  it('preserves note text', () => {
    const result = transformOrder(makeOrder({ note: { text: 'Please wrap as gift' } }))
    expect(result.note).toBe('Please wrap as gift')
  })

  it('produces a payload that satisfies OrderSchema and preserves raw in metadata', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
    expect(result.metadata).toBe(raw)
  })
})
