import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type TrimbleTruckmateTrackingResponse,
  type TrimbleTruckmateTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(
  overrides: Partial<TrimbleTruckmateTrackingEventRaw> = {},
): TrimbleTruckmateTrackingEventRaw {
  return {
    eventId: 'EVT-001',
    timestamp: '2024-03-01T08:00:00Z',
    statusCode: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      city: 'Kansas City',
      state: 'MO',
      zipCode: '64101',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTracking(
  overrides: Partial<TrimbleTruckmateTrackingResponse> = {},
): TrimbleTruckmateTrackingResponse {
  return {
    trackingNumber: 'TRK-001',
    shipmentId: 'SHP-001',
    status: 'IN_TRANSIT',
    statusDescription: 'In transit',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('trimble-truckmate transformTrackingEvents', () => {
  it('produces one event per raw event', () => {
    expect(transformTrackingEvents(makeTracking())).toHaveLength(1)
  })

  it('maps trackingNumber from response', () => {
    const events = transformTrackingEvents(makeTracking())
    expect(events[0].trackingNumber).toBe('TRK-001')
  })

  it('maps carrierId to trimble-truckmate', () => {
    expect(transformTrackingEvents(makeTracking())[0].carrierId).toBe('trimble-truckmate')
  })

  it('maps IN_TRANSIT statusCode to IN_TRANSIT', () => {
    // Verified in TRACKING_STATUS_MAP: IN_TRANSIT → 'IN_TRANSIT'
    expect(transformTrackingEvents(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from eventDescription', () => {
    expect(transformTrackingEvents(makeTracking())[0].description).toBe('Shipment in transit')
  })

  it('maps location city and state', () => {
    const loc = transformTrackingEvents(makeTracking())[0].location
    expect(loc?.city).toBe('Kansas City')
    expect(loc?.state).toBe('MO')
    expect(loc?.country).toBe('US')
  })

  it('maps occurredAt as Date', () => {
    expect(transformTrackingEvents(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits a fallback event when events are empty', () => {
    const events = transformTrackingEvents(makeTracking({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In transit')
  })

  it('maps PLANNED statusCode to PRE_TRANSIT', () => {
    // TRACKING_STATUS_MAP: PLANNED → 'PRE_TRANSIT'
    const events = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ statusCode: 'PLANNED' })] }),
    )
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('maps CANCELLED statusCode to FAILURE', () => {
    // TRACKING_STATUS_MAP: CANCELLED → 'FAILURE'
    const events = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ statusCode: 'CANCELLED' })] }),
    )
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps unknown statusCode to UNKNOWN', () => {
    const events = transformTrackingEvents(
      makeTracking({ events: [makeEvent({ statusCode: 'NOPE', status: undefined })] }),
    )
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('falls back tracking number to shipmentId', () => {
    const events = transformTrackingEvents(makeTracking({ trackingNumber: undefined }))
    expect(events[0].trackingNumber).toBe('SHP-001')
  })

  it('returns undefined location when location is empty', () => {
    const events = transformTrackingEvents(makeTracking({ events: [makeEvent({ location: {} })] }))
    expect(events[0].location).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    transformTrackingEvents(makeTracking()).forEach((evt) => {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    })
  })
})
