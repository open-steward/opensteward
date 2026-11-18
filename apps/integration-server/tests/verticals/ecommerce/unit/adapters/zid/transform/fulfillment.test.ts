import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/fulfillment'
import type { RawZidOrder } from '../../../../../../../src/verticals/ecommerce/adapters/zid/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrder(overrides: Partial<RawZidOrder> = {}): RawZidOrder {
  return {
    id: 8001,
    invoice_number: 1042,
    currency_code: 'SAR',
    order_status: { code: 'delivered', name: 'Delivered' },
    payment_status: 'paid',
    order_total: '350.00',
    shipping: {
      tracking_number: 'SA1234567890',
      tracking_url: 'https://track.aramex.com/SA1234567890',
      method: { name: 'Aramex', id: 3 },
    },
    created_at: '2026-01-15T09:30:00Z',
    updated_at: '2026-01-17T16:45:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Zid)', () => {
  it('uses order id as both id and orderId', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.id).toBe('8001')
    expect(result.orderId).toBe('8001')
  })

  it('maps delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'delivered' } }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps new status to PENDING', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'new' } }))
    expect(result.status).toBe('PENDING')
  })

  it('maps preparing status to PENDING', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'preparing' } }))
    expect(result.status).toBe('PENDING')
  })

  it('maps indelivery status to OPEN', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'indelivery' } }))
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'cancelled' } }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps canceled (US spelling) status to CANCELLED', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: 'canceled' } }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking_number from shipping', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingNumber).toBe('SA1234567890')
  })

  it('maps tracking_url from shipping', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.trackingUrl).toBe('https://track.aramex.com/SA1234567890')
  })

  it('maps shipping method name to carrier', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.carrier).toBe('Aramex')
  })

  it('maps createdAt and updatedAt from order timestamps', () => {
    const result = transformFulfillment(makeOrder())
    expect(result.createdAt).toBe('2026-01-15T09:30:00Z')
    expect(result.updatedAt).toBe('2026-01-17T16:45:00Z')
  })

  it('leaves status undefined when order_status has no code', () => {
    const result = transformFulfillment(makeOrder({ order_status: { code: null } }))
    expect(result.status).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeOrder()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeOrder())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Zid)', () => {
  it('maps trackingNumber and trackingUrl to snake_case', () => {
    const body = untransformFulfillment({
      trackingNumber: 'SA1234567890',
      trackingUrl: 'https://track.aramex.com/SA1234567890',
    })
    expect(body.tracking_number).toBe('SA1234567890')
    expect(body.tracking_url).toBe('https://track.aramex.com/SA1234567890')
  })
})
