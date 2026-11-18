import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawManomanoShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/manomano/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawManomanoShipment> = {}): RawManomanoShipment {
  return {
    id: 'SHP-001',
    order_id: 'ORD-999',
    status: 'SHIPPED',
    carrier: 'DHL',
    tracking_number: '1234567890',
    tracking_url: 'https://track.dhl.com/1234567890',
    order_lines: [{ id: 'LI-1', quantity: 2 }],
    shipped_at: '2024-03-01T00:00:00Z',
    estimated_delivery_at: '2024-03-05T00:00:00Z',
    delivered_at: null,
    created_at: '2024-02-28T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (ManoMano)', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('SHP-001')
    expect(result.orderId).toBe('ORD-999')
  })

  it('maps carrier and tracking fields', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.carrier).toBe('DHL')
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.trackingUrl).toBe('https://track.dhl.com/1234567890')
  })

  it('maps SHIPPED status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw({ status: 'SHIPPED' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps DELIVERED status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw({ status: 'DELIVERED' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps PENDING status to PENDING', () => {
    const result = transformFulfillment(makeRaw({ status: 'PENDING' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    const result = transformFulfillment(makeRaw({ status: 'CANCELLED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown status to undefined', () => {
    const result = transformFulfillment(makeRaw({ status: 'UNKNOWN_STATE' }))
    expect(result.status).toBeUndefined()
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('LI-1')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('omits lineItems when order_lines is empty', () => {
    const result = transformFulfillment(makeRaw({ order_lines: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps datetime fields', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.shippedAt).toBe('2024-03-01T00:00:00.000Z')
    expect(result.estimatedDeliveryAt).toBe('2024-03-05T00:00:00.000Z')
    expect(result.deliveredAt).toBeUndefined()
    expect(result.createdAt).toBe('2024-02-28T00:00:00.000Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('casts numeric id to string', () => {
    const result = transformFulfillment(makeRaw({ id: 777, order_id: 888 }))
    expect(result.id).toBe('777')
    expect(result.orderId).toBe('888')
  })

  it('produces schema-valid output', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw in metadata', () => {
    const raw = makeRaw()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })
})

describe('untransformFulfillment (ManoMano)', () => {
  it('returns carrier, tracking_number, tracking_url and order_lines', () => {
    const canonical = {
      id: 'SHP-001',
      orderId: 'ORD-999',
      carrier: 'DHL',
      trackingNumber: '1234567890',
      trackingUrl: 'https://track.dhl.com/1234567890',
      lineItems: [{ lineItemId: 'LI-1', quantity: 2 }],
      metadata: {},
    }
    const result = untransformFulfillment(canonical)
    expect(result.carrier).toBe('DHL')
    expect(result.tracking_number).toBe('1234567890')
    expect(result.tracking_url).toBe('https://track.dhl.com/1234567890')
    expect(result.order_lines).toEqual([{ id: 'LI-1', quantity: 2 }])
  })

  it('returns undefined order_lines when lineItems is absent', () => {
    const result = untransformFulfillment({ carrier: 'UPS', metadata: {} })
    expect(result.order_lines).toBeUndefined()
  })
})
