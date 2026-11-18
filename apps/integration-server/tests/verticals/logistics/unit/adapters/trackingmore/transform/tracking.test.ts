import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  transformShipment,
  type TrackingMoreTracking,
  type TrackingMoreCheckpoint,
} from '../../../../../../../src/verticals/logistics/adapters/trackingmore/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeCheckpoint(overrides: Partial<TrackingMoreCheckpoint> = {}): TrackingMoreCheckpoint {
  return {
    checkpoint_time: '2024-03-01T00:00:00Z',
    tracking_detail: 'Departed facility',
    location: 'Frankfurt Hub',
    country_iso2: 'DE',
    city: 'Frankfurt',
    state: 'HE',
    zip: '60308',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<TrackingMoreTracking> = {}): TrackingMoreTracking {
  return {
    id: 'tm-001',
    tracking_number: 'TRK999',
    courier_code: 'dhl',
    order_number: 'ORD-42',
    customer_name: 'Jane Doe',
    status: 'transit',
    original_country: 'DE',
    destination_country: 'US',
    origin_info: {
      courier_code: 'dhl',
      trackinfo: [makeCheckpoint()],
    },
    destination_info: {
      courier_code: 'dhl',
      trackinfo: [makeCheckpoint({ city: 'New York', country_iso2: 'US', zip: '10001' })],
    },
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ── transformTracking ─────────────────────────────────────────────────────────

describe('trackingmore transformTracking', () => {
  it('produces one event per checkpoint across origin + destination', () => {
    const events = transformTracking(makeRaw())
    expect(events).toHaveLength(2)
  })

  it('maps tracking_number and courier_code onto each event', () => {
    const [ev] = transformTracking(makeRaw())
    expect(ev.trackingNumber).toBe('TRK999')
    expect(ev.carrierId).toBe('dhl')
  })

  it('maps "transit" status to IN_TRANSIT', () => {
    const [ev] = transformTracking(makeRaw({ status: 'transit' }))
    expect(ev.status).toBe('IN_TRANSIT')
  })

  it('maps "delivered" status to DELIVERED', () => {
    const [ev] = transformTracking(makeRaw({ status: 'delivered' }))
    expect(ev.status).toBe('DELIVERED')
  })

  it('maps "pending" status to PRE_TRANSIT', () => {
    const [ev] = transformTracking(makeRaw({ status: 'pending' }))
    expect(ev.status).toBe('PRE_TRANSIT')
  })

  it('maps "undelivered" and "exception" to FAILURE', () => {
    expect(transformTracking(makeRaw({ status: 'undelivered' }))[0].status).toBe('FAILURE')
    expect(transformTracking(makeRaw({ status: 'exception' }))[0].status).toBe('FAILURE')
  })

  it('maps "pickup" to AVAILABLE_FOR_PICKUP', () => {
    expect(transformTracking(makeRaw({ status: 'pickup' }))[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('unknown status maps to UNKNOWN', () => {
    expect(transformTracking(makeRaw({ status: 'something_unknown' }))[0].status).toBe('UNKNOWN')
  })

  it('sets location from checkpoint fields', () => {
    const [ev] = transformTracking(makeRaw())
    expect(ev.location?.city).toBe('Frankfurt')
    expect(ev.location?.country).toBe('DE')
    expect(ev.location?.postalCode).toBe('60308')
  })

  it('sets occurredAt as a Date from checkpoint_time', () => {
    const [ev] = transformTracking(makeRaw())
    expect(ev.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to a single summary event when no checkpoints present', () => {
    const raw = makeRaw({
      origin_info: null,
      destination_info: null,
      latest_event: 'Package received',
    })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].description).toBe('Package received')
  })

  it('each event passes TrackingEventSchema.parse', () => {
    transformTracking(makeRaw()).forEach((ev) => {
      expect(() => TrackingEventSchema.parse(ev)).not.toThrow()
    })
  })

  it('location is undefined when checkpoint has no location fields', () => {
    const raw = makeRaw({
      origin_info: {
        trackinfo: [
          makeCheckpoint({
            city: null,
            state: null,
            zip: null,
            country_iso2: null,
            location: null,
          }),
        ],
      },
      destination_info: null,
    })
    const [ev] = transformTracking(raw)
    expect(ev.location).toBeUndefined()
  })
})

// ── transformShipment ─────────────────────────────────────────────────────────

describe('trackingmore transformShipment', () => {
  it('maps id, trackingNumber, and status fields', () => {
    const result = transformShipment(makeRaw())
    expect(result.id).toBe('tm-001')
    expect(result.trackingNumber).toBe('TRK999')
    expect(result.status).toBe('IN_TRANSIT')
  })

  it('maps carrierId from courier_code', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('dhl')
  })

  it('maps "delivered" status to DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps "exception" status to EXCEPTION', () => {
    expect(transformShipment(makeRaw({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('maps "expired" status to RETURNED', () => {
    expect(transformShipment(makeRaw({ status: 'expired' })).status).toBe('RETURNED')
  })

  it('maps "pickup" status to OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeRaw({ status: 'pickup' })).status).toBe('OUT_FOR_DELIVERY')
  })

  it('sets origin and destination country from top-level fields', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.country).toBe('DE')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('sets reference from order_number', () => {
    expect(transformShipment(makeRaw()).reference).toBe('ORD-42')
  })

  it('populates createdAt and updatedAt as Dates', () => {
    const result = transformShipment(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('omits originAddress when original_country is absent', () => {
    const result = transformShipment(makeRaw({ original_country: null }))
    expect(result.originAddress).toBeUndefined()
  })
})
