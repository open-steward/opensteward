import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  type RawMeliShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/mercadolibre/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawMeliShipment> = {}): RawMeliShipment {
  return {
    id: 60000001,
    order_id: 4000000001,
    status: 'shipped',
    tracking_number: 'AR1234567890',
    tracking_method: { id: 1, name: 'Mercado Envíos' },
    date_created: '2024-05-01T14:00:00.000Z',
    last_updated: '2024-05-02T10:00:00.000Z',
    status_history: {
      date_shipped: '2024-05-01T16:00:00.000Z',
      date_handling: '2024-05-01T14:30:00.000Z',
      date_ready_to_ship: '2024-05-01T15:00:00.000Z',
    },
    shipping_option: {
      name: 'Estándar',
      estimated_delivery_time: {
        date: '2024-05-05T23:59:59.000Z',
      },
    },
    ...overrides,
  }
}

describe('transformFulfillment (Mercado Libre)', () => {
  it('maps core fields and uses shipment id as canonical id', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('60000001')
    expect(result.orderId).toBe('4000000001')
    expect(result.trackingNumber).toBe('AR1234567890')
  })

  it('maps shipped status to OPEN', () => {
    const result = transformFulfillment(makeShipment({ status: 'shipped' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'delivered' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformFulfillment(makeShipment({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps not_delivered status to FAILURE', () => {
    const result = transformFulfillment(makeShipment({ status: 'not_delivered' }))
    expect(result.status).toBe('FAILURE')
  })

  it('extracts carrier from tracking_method name', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('Mercado Envíos')
  })

  it('falls back to shipping_option name for carrier', () => {
    const result = transformFulfillment(
      makeShipment({ tracking_method: undefined }),
    )
    expect(result.carrier).toBe('Estándar')
  })

  it('extracts shipped date from status_history', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.shippedAt).toBe('2024-05-01T16:00:00.000Z')
  })

  it('extracts estimated delivery date', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.estimatedDeliveryAt).toBe('2024-05-05T23:59:59.000Z')
  })

  it('handles missing tracking number', () => {
    const result = transformFulfillment(makeShipment({ tracking_number: null }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('handles missing order_id', () => {
    const result = transformFulfillment(makeShipment({ order_id: undefined }))
    expect(result.orderId).toBe('unknown')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('transformFulfillments handles empty array', () => {
    expect(transformFulfillments([])).toEqual([])
    expect(transformFulfillments(undefined)).toEqual([])
  })

  it('transformFulfillments maps multiple shipments', () => {
    const shipments = [
      makeShipment({ id: 1 }),
      makeShipment({ id: 2 }),
    ]
    const results = transformFulfillments(shipments)
    expect(results).toHaveLength(2)
    expect(results[0]!.id).toBe('1')
    expect(results[1]!.id).toBe('2')
  })
})
