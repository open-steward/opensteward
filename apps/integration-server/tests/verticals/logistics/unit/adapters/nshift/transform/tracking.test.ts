import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type NShiftTrackingResponse,
  type NShiftTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeEvent(overrides: Partial<NShiftTrackingEvent> = {}): NShiftTrackingEvent {
  return {
    eventCode: 'IN_TRANSIT',
    status: 'In transit to destination',
    description: 'Parcel in transit',
    eventTime: '2024-03-02T09:00:00Z',
    timestamp: '2024-03-02T09:00:00Z',
    location: {
      city: 'Hamburg',
      country: 'DE',
      postal_code: '20457',
    },
    ...overrides,
  }
}

function makeTracking(overrides: Partial<NShiftTrackingResponse> = {}): NShiftTrackingResponse {
  return {
    shipmentId: 'shp-001',
    parcelNo: '370000000001',
    trackingNumber: 'TRK-20240301',
    status: 'IN_TRANSIT',
    events: [makeEvent()],
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one TrackingEvent per event in the events array', () => {
    const raw = makeTracking({
      events: [
        makeEvent({ eventCode: 'STORED', description: 'Label created' }),
        makeEvent({ eventCode: 'IN_TRANSIT', description: 'In transit' }),
      ],
    })
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps shipmentId from raw response', () => {
    const raw = makeTracking()
    const event = transformTracking(raw)[0]

    expect(event.shipmentId).toBe('shp-001')
  })

  it('prefers trackingNumber over parcelNo', () => {
    const raw = makeTracking()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('TRK-20240301')
  })

  it('falls back to parcelNo when trackingNumber is null', () => {
    const raw = makeTracking({ trackingNumber: null })
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('370000000001')
  })

  it('sets carrierId to nshift on every event', () => {
    const raw = makeTracking()
    transformTracking(raw).forEach((e) => {
      expect(e.carrierId).toBe('nshift')
    })
  })

  it('maps description from raw event', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)[0].description).toBe('Parcel in transit')
  })

  it('maps location city, country, postalCode', () => {
    const raw = makeTracking()
    const location = transformTracking(raw)[0].location

    expect(location?.city).toBe('Hamburg')
    expect(location?.country).toBe('DE')
    expect(location?.postalCode).toBe('20457')
  })

  it('parses eventTime as occurredAt Date', () => {
    const raw = makeTracking()
    expect(transformTracking(raw)[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to timestamp when eventTime is null', () => {
    const raw = makeTracking({
      events: [makeEvent({ eventTime: null, timestamp: '2024-03-02T09:00:00Z' })],
    })
    expect(transformTracking(raw)[0].occurredAt).toBeInstanceOf(Date)
  })

  it('maps eventCode STORED to PRE_TRANSIT', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'STORED' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps eventCode BOOKED to PRE_TRANSIT', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'BOOKED' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps eventCode PRINTED to PRE_TRANSIT', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'PRINTED' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps eventCode IN_TRANSIT to IN_TRANSIT', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'IN_TRANSIT' })] })
    expect(transformTracking(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps eventCode DELIVERING to IN_TRANSIT', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'DELIVERING' })] })
    expect(transformTracking(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps eventCode OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'OUT_FOR_DELIVERY' })] })
    expect(transformTracking(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps eventCode DELIVERED to DELIVERED', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'DELIVERED' })] })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })

  it('maps eventCode containing RETURN to RETURN_TO_SENDER', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'RETURN_INITIATED' })] })
    expect(transformTracking(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps eventCode containing PICKUP to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'PICKUP_AVAILABLE' })] })
    expect(transformTracking(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps PARCEL_SHOP eventCode to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'PARCEL_SHOP' })] })
    expect(transformTracking(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps eventCode containing FAIL to FAILURE', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'DELIVERY_FAIL' })] })
    expect(transformTracking(raw)[0].status).toBe('FAILURE')
  })

  it('maps eventCode containing EXCEPTION to FAILURE', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'EXCEPTION' })] })
    expect(transformTracking(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown eventCode to UNKNOWN', () => {
    const raw = makeTracking({ events: [makeEvent({ eventCode: 'SOMETHING_ELSE', status: null })] })
    expect(transformTracking(raw)[0].status).toBe('UNKNOWN')
  })

  it('emits a single fallback event when events array is empty', () => {
    const raw = makeTracking({ events: [] })
    const events = transformTracking(raw)

    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('TRK-20240301')
    expect(events[0].carrierId).toBe('nshift')
  })

  it('uses raw.status for fallback event status when events is empty', () => {
    const raw = makeTracking({ events: [], status: 'DELIVERED_OK' })
    const events = transformTracking(raw)

    expect(events[0].status).toBe('DELIVERED')
  })

  it('handles null location gracefully', () => {
    const raw = makeTracking({
      events: [makeEvent({ location: null })],
    })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema.parse without throwing for each event', () => {
    const raw = makeTracking()
    transformTracking(raw).forEach((event) => {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    })
  })
})
