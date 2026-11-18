import { describe, it, expect } from 'vitest'
import {
  transformShipmentToTrackingEvents,
  type WondermentShipment,
  type WondermentTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/wonderment/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<WondermentTrackingEvent> = {}): WondermentTrackingEvent {
  return {
    date: '2024-03-01T00:00:00Z',
    status: 'IN_TRANSIT',
    locationDisplay: 'Louisville, KY',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<WondermentShipment> = {}): WondermentShipment {
  return {
    id: 'wm_shp_001',
    trackingCode: 'TRACK123456',
    orderName: '#1042',
    carrierName: 'ups',
    carrierService: 'UPS_GROUND',
    packageEta: '2024-03-05T00:00:00Z',
    statusDetails: { status: 'IN_TRANSIT', substatus: null },
    events: [makeEvent()],
    ...overrides,
  }
}

// ─── Events from raw.events ───────────────────────────────────────────────────

describe('transformShipmentToTrackingEvents — events path', () => {
  it('returns one event per raw event entry', () => {
    const raw = makeRaw({ events: [makeEvent(), makeEvent({ status: 'DELIVERED' })] })
    expect(transformShipmentToTrackingEvents(raw)).toHaveLength(2)
  })

  it('maps trackingNumber from raw.trackingCode', () => {
    expect(transformShipmentToTrackingEvents(makeRaw())[0].trackingNumber).toBe('TRACK123456')
  })

  it('falls back to raw.trackingNumber when trackingCode is absent', () => {
    const raw = makeRaw({ trackingCode: null, trackingNumber: 'TRK_FALLBACK' })
    expect(transformShipmentToTrackingEvents(raw)[0].trackingNumber).toBe('TRK_FALLBACK')
  })

  it('maps carrierId from raw.carrierName', () => {
    expect(transformShipmentToTrackingEvents(makeRaw())[0].carrierId).toBe('ups')
  })

  it('maps status IN_TRANSIT from event.status', () => {
    expect(transformShipmentToTrackingEvents(makeRaw())[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from event.status text', () => {
    expect(transformShipmentToTrackingEvents(makeRaw())[0].description).toBe('IN_TRANSIT')
  })

  it('maps occurredAt from event.date as Date', () => {
    const result = transformShipmentToTrackingEvents(makeRaw())[0]
    expect(result.occurredAt).toBeInstanceOf(Date)
    expect(result.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('sets occurredAt to undefined when event.date is null', () => {
    const raw = makeRaw({ events: [makeEvent({ date: null })] })
    expect(transformShipmentToTrackingEvents(raw)[0].occurredAt).toBeUndefined()
  })

  it('attaches raw event as metadata', () => {
    const evt = makeEvent()
    const raw = makeRaw({ events: [evt] })
    expect(transformShipmentToTrackingEvents(raw)[0].metadata).toBe(evt)
  })
})

// ─── Location parsing ─────────────────────────────────────────────────────────

describe('transformShipmentToTrackingEvents — location parsing', () => {
  it('parses "City, State" into city and state', () => {
    const raw = makeRaw({ events: [makeEvent({ locationDisplay: 'Louisville, KY' })] })
    const loc = transformShipmentToTrackingEvents(raw)[0].location
    expect(loc?.city).toBe('Louisville')
    expect(loc?.state).toBe('KY')
  })

  it('parses "City, State, Country" into city, state and country', () => {
    const raw = makeRaw({
      events: [makeEvent({ locationDisplay: 'Toronto, Ontario, Canada' })],
    })
    const loc = transformShipmentToTrackingEvents(raw)[0].location
    expect(loc?.city).toBe('Toronto')
    expect(loc?.state).toBe('Ontario')
    expect(loc?.country).toBe('Canada')
  })

  it('sets location.city when only a single segment is present', () => {
    const raw = makeRaw({ events: [makeEvent({ locationDisplay: 'Chicago' })] })
    const loc = transformShipmentToTrackingEvents(raw)[0].location
    expect(loc?.city).toBe('Chicago')
    expect(loc?.state).toBeUndefined()
  })

  it('sets location to undefined when locationDisplay is null', () => {
    const raw = makeRaw({ events: [makeEvent({ locationDisplay: null })] })
    expect(transformShipmentToTrackingEvents(raw)[0].location).toBeUndefined()
  })
})

// ─── Status mapping on events ─────────────────────────────────────────────────

describe('transformShipmentToTrackingEvents — status mapping', () => {
  const status = (s: string | null) =>
    transformShipmentToTrackingEvents(makeRaw({ events: [makeEvent({ status: s })] }))[0].status

  it('maps PRE_TRANSIT to PRE_TRANSIT', () => {
    expect(status('PRE_TRANSIT')).toBe('PRE_TRANSIT')
  })

  it('maps SHIPMENT_CREATED to PRE_TRANSIT', () => {
    expect(status('SHIPMENT_CREATED')).toBe('PRE_TRANSIT')
  })

  it('maps CONFIRMED to PRE_TRANSIT', () => {
    expect(status('CONFIRMED')).toBe('PRE_TRANSIT')
  })

  it('maps IN_TRANSIT to IN_TRANSIT', () => {
    expect(status('IN_TRANSIT')).toBe('IN_TRANSIT')
  })

  it('maps TRANSIT to IN_TRANSIT', () => {
    expect(status('TRANSIT')).toBe('IN_TRANSIT')
  })

  it('maps OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    expect(status('OUT_FOR_DELIVERY')).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED to DELIVERED', () => {
    expect(status('DELIVERED')).toBe('DELIVERED')
  })

  it('maps READY_FOR_PICKUP to AVAILABLE_FOR_PICKUP', () => {
    expect(status('READY_FOR_PICKUP')).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps AVAILABLE_FOR_PICKUP to AVAILABLE_FOR_PICKUP', () => {
    expect(status('AVAILABLE_FOR_PICKUP')).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps ATTEMPTED_DELIVERY to FAILURE', () => {
    expect(status('ATTEMPTED_DELIVERY')).toBe('FAILURE')
  })

  it('maps SHIPMENT_STALLED to FAILURE', () => {
    expect(status('SHIPMENT_STALLED')).toBe('FAILURE')
  })

  it('maps RETURNED to FAILURE', () => {
    expect(status('RETURNED')).toBe('FAILURE')
  })

  it('maps ERROR to FAILURE', () => {
    expect(status('ERROR')).toBe('FAILURE')
  })

  it('maps CANCELLED to FAILURE', () => {
    expect(status('CANCELLED')).toBe('FAILURE')
  })

  it('maps null to UNKNOWN', () => {
    expect(status(null)).toBe('UNKNOWN')
  })

  it('maps unrecognised value to UNKNOWN', () => {
    expect(status('MYSTERY_STATUS')).toBe('UNKNOWN')
  })

  it('is case-insensitive for status strings', () => {
    expect(status('delivered')).toBe('DELIVERED')
  })
})

// ─── Fallback when events array is empty ──────────────────────────────────────

describe('transformShipmentToTrackingEvents — empty-events fallback', () => {
  it('returns exactly one synthetic event when events is empty', () => {
    const raw = makeRaw({ events: [] })
    expect(transformShipmentToTrackingEvents(raw)).toHaveLength(1)
  })

  it('returns exactly one synthetic event when events is null', () => {
    const raw = makeRaw({ events: null })
    expect(transformShipmentToTrackingEvents(raw)).toHaveLength(1)
  })

  it('synthetic event uses statusDetails.status for status', () => {
    const raw = makeRaw({ events: [], statusDetails: { status: 'DELIVERED', substatus: null } })
    expect(transformShipmentToTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('synthetic event description comes from statusDetails.status', () => {
    const raw = makeRaw({ events: [], statusDetails: { status: 'PRE_TRANSIT', substatus: null } })
    expect(transformShipmentToTrackingEvents(raw)[0].description).toBe('PRE_TRANSIT')
  })

  it('synthetic event has no occurredAt', () => {
    const raw = makeRaw({ events: [] })
    expect(transformShipmentToTrackingEvents(raw)[0].occurredAt).toBeUndefined()
  })

  it('synthetic event carries raw shipment as metadata', () => {
    const raw = makeRaw({ events: [] })
    expect(transformShipmentToTrackingEvents(raw)[0].metadata).toBe(raw)
  })

  it('synthetic event inherits trackingNumber and carrierId', () => {
    const raw = makeRaw({ events: [] })
    const [evt] = transformShipmentToTrackingEvents(raw)
    expect(evt.trackingNumber).toBe('TRACK123456')
    expect(evt.carrierId).toBe('ups')
  })
})

// ─── Schema validation ────────────────────────────────────────────────────────

describe('transformShipmentToTrackingEvents — schema validation', () => {
  it('every event from events array passes TrackingEventSchema', () => {
    const raw = makeRaw({
      events: [
        makeEvent({ status: 'IN_TRANSIT' }),
        makeEvent({ status: 'DELIVERED', locationDisplay: 'Austin, TX, US' }),
      ],
    })
    for (const evt of transformShipmentToTrackingEvents(raw)) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })

  it('synthetic fallback event passes TrackingEventSchema', () => {
    const raw = makeRaw({ events: [] })
    expect(() => TrackingEventSchema.parse(transformShipmentToTrackingEvents(raw)[0])).not.toThrow()
  })

  it('passes TrackingEventSchema for a minimal raw input', () => {
    const minimal: WondermentShipment = {}
    const events = transformShipmentToTrackingEvents(minimal)
    expect(events).toHaveLength(1)
    expect(() => TrackingEventSchema.parse(events[0])).not.toThrow()
  })
})
