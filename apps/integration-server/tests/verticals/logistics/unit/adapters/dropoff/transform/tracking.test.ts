import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DropoffOrder,
} from '../../../../../../../src/verticals/logistics/adapters/dropoff/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(o: Partial<DropoffOrder> = {}): DropoffOrder {
  return {
    order_id: 'do-001',
    order_status_code: 'delivered',
    tracking_number: 'TRK-DO-001',
    updated: '2024-03-01T12:00:00Z',
    created: '2024-03-01T00:00:00Z',
    ...o,
  }
}

describe('dropoff transformTracking', () => {
  it('returns exactly one event', () => {
    expect(transformTracking(makeOrder())).toHaveLength(1)
  })

  it('pending → PRE_TRANSIT', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'pending' }))[0].status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('in_transit → IN_TRANSIT', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'in_transit' }))[0].status).toBe(
      'IN_TRANSIT',
    )
  })

  it('out_for_delivery → OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'out_for_delivery' }))[0].status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('delivered → DELIVERED', () => {
    expect(transformTracking(makeOrder())[0].status).toBe('DELIVERED')
  })

  it('returned → RETURN_TO_SENDER', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'returned' }))[0].status).toBe(
      'RETURN_TO_SENDER',
    )
  })

  it('cancelled → FAILURE', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'cancelled' }))[0].status).toBe(
      'FAILURE',
    )
  })

  it('unknown status → UNKNOWN', () => {
    expect(transformTracking(makeOrder({ order_status_code: 'something_else' }))[0].status).toBe(
      'UNKNOWN',
    )
  })

  it('shipmentId is order_id', () => {
    expect(transformTracking(makeOrder())[0].shipmentId).toBe('do-001')
  })

  it('trackingNumber uses tracking_number field', () => {
    expect(transformTracking(makeOrder())[0].trackingNumber).toBe('TRK-DO-001')
  })

  it('falls back to order_id when tracking_number absent', () => {
    expect(transformTracking(makeOrder({ tracking_number: null }))[0].trackingNumber).toBe('do-001')
  })

  it('carrierId is dropoff', () => {
    expect(transformTracking(makeOrder())[0].carrierId).toBe('dropoff')
  })

  it('occurredAt is a Date', () => {
    expect(transformTracking(makeOrder())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to order_status for description when order_status_code used', () => {
    const order = makeOrder({ order_status: 'delivered', order_status_code: 'delivered' })
    expect(transformTracking(order)[0].description).toBe('delivered')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeOrder())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('metadata is the raw order', () => {
    const raw = makeOrder()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })
})
