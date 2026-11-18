import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTracking,
  type ShipsyTrackingEvent,
  type ShipsyShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipsy/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<ShipsyTrackingEvent> = {}): ShipsyTrackingEvent {
  return {
    id: 'ev-001',
    shipment_id: 'shp-001',
    tracking_number: 'SHIPSY123456',
    status: 'IN_TRANSIT',
    description: 'Package picked up',
    city: 'Mumbai',
    state: 'MH',
    country: 'IN',
    timestamp: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<ShipsyShipment> = {}): ShipsyShipment {
  return {
    id: 42,
    shipment_id: 'shp-001',
    tracking_number: 'SHIPSY123456',
    status: 'OUT_FOR_DELIVERY',
    events: [
      makeEvent({ status: 'PENDING', description: 'Order placed' }),
      makeEvent({
        status: 'IN_TRANSIT',
        description: 'In transit',
        timestamp: '2024-03-02T00:00:00Z',
      }),
    ],
    origin_city: 'Delhi',
    destination_city: 'Mumbai',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── transformTrackingEvent ──────────────────────────────────────────────────

describe('transformTrackingEvent (shipsy)', () => {
  it('coerces numeric id to string', () => {
    expect(transformTrackingEvent({ id: 99 }).id).toBe('99')
  })

  it('maps string id as-is', () => {
    expect(transformTrackingEvent(makeEvent()).id).toBe('ev-001')
  })

  it('maps shipment_id and tracking_number from raw', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('SHIPSY123456')
  })

  it('uses supplied shipmentId and trackingNumber when raw fields absent', () => {
    const result = transformTrackingEvent({ status: 'DELIVERED' }, 'shp-fallback', 'TRK-fallback')
    expect(result.shipmentId).toBe('shp-fallback')
    expect(result.trackingNumber).toBe('TRK-fallback')
  })

  it('carrierId is hardcoded to "shipsy"', () => {
    expect(transformTrackingEvent(makeEvent()).carrierId).toBe('shipsy')
  })

  it('maps all tracking statuses', () => {
    const cases: [string, string][] = [
      ['PENDING', 'PRE_TRANSIT'],
      ['CREATED', 'PRE_TRANSIT'],
      ['BOOKED', 'PRE_TRANSIT'],
      ['PICKED_UP', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['DISPATCHED', 'IN_TRANSIT'],
      ['ARRIVED', 'IN_TRANSIT'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['AVAILABLE_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['RTO', 'RETURN_TO_SENDER'],
      ['FAILED', 'FAILURE'],
      ['UNDELIVERED', 'FAILURE'],
      ['CANCELLED', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformTrackingEvent(makeEvent({ status })).status).toBe(expected)
    }
  })

  it('maps location from city/state/country fields', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.location?.city).toBe('Mumbai')
    expect(result.location?.state).toBe('MH')
    expect(result.location?.country).toBe('IN')
  })

  it('falls back to location string as street1 when city/state/country absent', () => {
    const result = transformTrackingEvent(
      makeEvent({
        city: undefined,
        state: undefined,
        country: undefined,
        location: 'Mumbai Depot',
      }),
    )
    expect(result.location?.street1).toBe('Mumbai Depot')
  })

  it('location is undefined when all location fields absent', () => {
    const result = transformTrackingEvent(
      makeEvent({ city: undefined, state: undefined, country: undefined, location: undefined }),
    )
    expect(result.location).toBeUndefined()
  })

  it('maps occurredAt from timestamp via new Date()', () => {
    const result = transformTrackingEvent(makeEvent())
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to created_at when timestamp is absent', () => {
    const result = transformTrackingEvent(
      makeEvent({ timestamp: undefined, created_at: '2024-03-01T00:00:00Z' }),
    )
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('occurredAt is undefined when both timestamp and created_at are absent', () => {
    const result = transformTrackingEvent(
      makeEvent({ timestamp: undefined, created_at: undefined }),
    )
    expect(result.occurredAt).toBeUndefined()
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeEvent()).description).toBe('Package picked up')
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvent(makeEvent()))).not.toThrow()
  })
})

// ─── transformTracking ───────────────────────────────────────────────────────

describe('transformTracking (shipsy)', () => {
  it('produces one event per event entry', () => {
    expect(transformTracking(makeShipment())).toHaveLength(2)
  })

  it('each event has carrierId "shipsy"', () => {
    for (const event of transformTracking(makeShipment())) {
      expect(event.carrierId).toBe('shipsy')
    }
  })

  it('propagates shipment_id to each event when event has no own shipment_id', () => {
    const shipment = makeShipment({
      events: [makeEvent({ shipment_id: undefined })],
    })
    const [event] = transformTracking(shipment)
    expect(event.shipmentId).toBe('shp-001')
  })

  it('propagates tracking_number to each event when event has no own tracking_number', () => {
    const shipment = makeShipment({
      events: [makeEvent({ tracking_number: undefined })],
    })
    const [event] = transformTracking(shipment)
    expect(event.trackingNumber).toBe('SHIPSY123456')
  })

  it('emits a single synthetic fallback event when events is empty', () => {
    const events = transformTracking(makeShipment({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].carrierId).toBe('shipsy')
    expect(events[0].shipmentId).toBe('shp-001')
    // OUT_FOR_DELIVERY → OUT_FOR_DELIVERY
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('emits fallback event when events is undefined', () => {
    const events = transformTracking(makeShipment({ events: undefined }))
    expect(events).toHaveLength(1)
  })

  it('fallback event occurredAt comes from updated_at', () => {
    const events = transformTracking(makeShipment({ events: [] }))
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('fallback event uses created_at when updated_at is absent', () => {
    const events = transformTracking(makeShipment({ events: [], updated_at: undefined }))
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('derives shipmentId from numeric id when shipment_id is absent', () => {
    const events = transformTracking(makeShipment({ events: [], shipment_id: undefined, id: 99 }))
    expect(events[0].shipmentId).toBe('99')
  })

  it('passes TrackingEventSchema.parse for each event without throwing', () => {
    for (const event of transformTracking(makeShipment())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('fallback single event passes TrackingEventSchema.parse without throwing', () => {
    const [event] = transformTracking(makeShipment({ events: [] }))
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
