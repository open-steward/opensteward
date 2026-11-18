import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTracking,
  type TcsTrackingEvent,
  type TcsShipment,
} from '../../../../../../../src/verticals/logistics/adapters/tcs-express/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<TcsTrackingEvent> = {}): TcsTrackingEvent {
  return {
    id: 'evt-001',
    shipment_id: 'shp-001',
    tracking_number: 'TCS123456789',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    city: 'Karachi',
    state: 'Sindh',
    country: 'PK',
    timestamp: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<TcsShipment> = {}): TcsShipment {
  return {
    id: 'shp-001',
    consignment_number: 'TCS123456789',
    tracking_number: 'TCS123456789',
    status: 'IN_TRANSIT',
    events: [
      makeEvent({ status: 'BOOKED', description: 'Booked', timestamp: '2024-03-01T00:00:00Z' }),
      makeEvent({
        id: 'evt-002',
        status: 'IN_TRANSIT',
        description: 'In transit',
        timestamp: '2024-03-02T00:00:00Z',
      }),
    ],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('tcs-express transformTrackingEvent', () => {
  it('maps id from raw.id (to string)', () => {
    expect(transformTrackingEvent(makeEvent()).id).toBe('evt-001')
  })

  it('maps numeric id to string', () => {
    expect(transformTrackingEvent(makeEvent({ id: 42 })).id).toBe('42')
  })

  it('maps shipmentId from raw.shipment_id', () => {
    expect(transformTrackingEvent(makeEvent()).shipmentId).toBe('shp-001')
  })

  it('uses the shipmentId argument when raw.shipment_id is absent', () => {
    expect(
      transformTrackingEvent(makeEvent({ shipment_id: undefined }), 'provided-sid').shipmentId,
    ).toBe('provided-sid')
  })

  it('maps trackingNumber from raw.tracking_number', () => {
    expect(transformTrackingEvent(makeEvent()).trackingNumber).toBe('TCS123456789')
  })

  it('uses the trackingNumber argument as fallback', () => {
    expect(
      transformTrackingEvent(makeEvent({ tracking_number: undefined }), undefined, 'ARG-TRK')
        .trackingNumber,
    ).toBe('ARG-TRK')
  })

  it('maps carrierId to tcs-express', () => {
    expect(transformTrackingEvent(makeEvent()).carrierId).toBe('tcs-express')
  })

  it('maps status IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
    expect(transformTrackingEvent(makeEvent({ status: 'PICKED_UP' })).status).toBe('IN_TRANSIT')
    expect(transformTrackingEvent(makeEvent({ status: 'ARRIVED' })).status).toBe('IN_TRANSIT')
  })

  it('maps status PRE_TRANSIT', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'BOOKED' })).status).toBe('PRE_TRANSIT')
    expect(transformTrackingEvent(makeEvent({ status: 'PENDING' })).status).toBe('PRE_TRANSIT')
    expect(transformTrackingEvent(makeEvent({ status: 'CREATED' })).status).toBe('PRE_TRANSIT')
  })

  it('maps status OUT_FOR_DELIVERY', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'OUT_FOR_DELIVERY' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status DELIVERED', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps status AVAILABLE_FOR_PICKUP', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'AVAILABLE_FOR_PICKUP' })).status).toBe(
      'AVAILABLE_FOR_PICKUP',
    )
  })

  it('maps status RETURN_TO_SENDER', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'RETURNED' })).status).toBe(
      'RETURN_TO_SENDER',
    )
    expect(transformTrackingEvent(makeEvent({ status: 'RTO' })).status).toBe('RETURN_TO_SENDER')
  })

  it('maps status FAILURE', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'FAILED' })).status).toBe('FAILURE')
    expect(transformTrackingEvent(makeEvent({ status: 'CANCELLED' })).status).toBe('FAILURE')
    expect(transformTrackingEvent(makeEvent({ status: 'LOST' })).status).toBe('FAILURE')
  })

  it('maps status UNKNOWN for unrecognised codes', () => {
    expect(transformTrackingEvent(makeEvent({ status: 'BOGUS_STATUS' })).status).toBe('UNKNOWN')
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeEvent()).description).toBe('Shipment in transit')
  })

  it('maps location with city/state/country', () => {
    const r = transformTrackingEvent(makeEvent())
    expect(r.location?.city).toBe('Karachi')
    expect(r.location?.state).toBe('Sindh')
    expect(r.location?.country).toBe('PK')
  })

  it('maps location from location string when city/state/country absent', () => {
    const r = transformTrackingEvent(
      makeEvent({ city: undefined, state: undefined, country: undefined, location: 'Hub-KHI' }),
    )
    expect(r.location?.street1).toBe('Hub-KHI')
  })

  it('maps occurredAt from timestamp as Date', () => {
    const r = transformTrackingEvent(makeEvent())
    expect(r.occurredAt).toBeInstanceOf(Date)
    expect(r.occurredAt!.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back occurredAt to event_time when timestamp is absent', () => {
    const r = transformTrackingEvent(
      makeEvent({ timestamp: undefined, event_time: '2024-03-02T00:00:00Z' }),
    )
    expect(r.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeEvent()
    expect(transformTrackingEvent(raw).metadata).toBe(raw)
  })

  it('produces schema-valid TrackingEvent', () => {
    expect(() => TrackingEventSchema.parse(transformTrackingEvent(makeEvent()))).not.toThrow()
  })
})

describe('tcs-express transformTracking', () => {
  it('maps each event in the events array', () => {
    const results = transformTracking(makeShipment())
    expect(results).toHaveLength(2)
  })

  it('maps trackingNumber from consignment_number', () => {
    const results = transformTracking(makeShipment())
    expect(results[0].trackingNumber).toBe('TCS123456789')
  })

  it('maps shipmentId from shipment.id', () => {
    const results = transformTracking(makeShipment())
    expect(results[0].shipmentId).toBe('shp-001')
  })

  it('maps each event status correctly', () => {
    const results = transformTracking(makeShipment())
    expect(results[0].status).toBe('PRE_TRANSIT') // BOOKED
    expect(results[1].status).toBe('IN_TRANSIT')
  })

  it('returns a synthetic event when events array is empty', () => {
    const results = transformTracking(makeShipment({ events: [] }))
    expect(results).toHaveLength(1)
    expect(results[0].status).toBe('IN_TRANSIT') // top-level status IN_TRANSIT
  })

  it('synthetic event occurredAt comes from updated_at', () => {
    const results = transformTracking(makeShipment({ events: [] }))
    expect(results[0].occurredAt).toBeInstanceOf(Date)
    expect(results[0].occurredAt!.toISOString()).toBe('2024-03-02T00:00:00.000Z')
  })

  it('falls back synthetic event occurredAt to created_at when updated_at is absent', () => {
    const results = transformTracking(makeShipment({ events: [], updated_at: undefined }))
    expect(results[0].occurredAt).toBeInstanceOf(Date)
    expect(results[0].occurredAt!.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('uses tracking_number as fallback when consignment_number is absent', () => {
    const results = transformTracking(makeShipment({ consignment_number: undefined }))
    expect(results[0].trackingNumber).toBe('TCS123456789')
  })

  it('produces schema-valid TrackingEvent objects for all entries', () => {
    const results = transformTracking(makeShipment())
    for (const r of results) {
      expect(() => TrackingEventSchema.parse(r)).not.toThrow()
    }
  })
})
