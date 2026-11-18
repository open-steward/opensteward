import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type TruckstopTenderResponse,
  type TruckstopTenderEvent,
} from '../../../../../../../src/verticals/logistics/adapters/truckstop/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<TruckstopTenderEvent> = {}): TruckstopTenderEvent {
  return {
    eventType: 'In Transit',
    eventDescription: 'Load in transit',
    eventDateTime: '2024-03-02T10:00:00Z',
    location: { city: 'Dallas', state: 'TX', zip: '75201', country: 'US' },
    ...overrides,
  }
}

function makeTender(overrides: Partial<TruckstopTenderResponse> = {}): TruckstopTenderResponse {
  return {
    tenderId: 'TND-001',
    loadNumber: 'LN-001',
    loadGuid: 'LG-001',
    status: 'In Transit',
    statusDescription: 'Load in transit',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('truckstop transformTrackingEvents', () => {
  it('produces one event per raw event', () => {
    expect(transformTrackingEvents(makeTender())).toHaveLength(1)
  })

  it('maps trackingNumber from loadNumber', () => {
    expect(transformTrackingEvents(makeTender())[0].trackingNumber).toBe('LN-001')
  })

  it('maps carrierId to truckstop', () => {
    expect(transformTrackingEvents(makeTender())[0].carrierId).toBe('truckstop')
  })

  it('maps In Transit eventType to IN_TRANSIT', () => {
    // LOAD_STATUS_TRACKING_MAP: 'In Transit' → 'IN_TRANSIT'
    expect(transformTrackingEvents(makeTender())[0].status).toBe('IN_TRANSIT')
  })

  it('maps Delivered status to DELIVERED', () => {
    const events = transformTrackingEvents(
      makeTender({ events: [makeEvent({ eventType: 'Delivered' })] }),
    )
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps Cancelled to FAILURE', () => {
    const events = transformTrackingEvents(
      makeTender({ events: [makeEvent({ eventType: 'Cancelled' })] }),
    )
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps description', () => {
    expect(transformTrackingEvents(makeTender())[0].description).toBe('Load in transit')
  })

  it('maps location city, state, country', () => {
    const loc = transformTrackingEvents(makeTender())[0].location
    expect(loc?.city).toBe('Dallas')
    expect(loc?.state).toBe('TX')
    expect(loc?.country).toBe('US')
  })

  it('maps occurredAt as Date', () => {
    expect(transformTrackingEvents(makeTender())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits a summary event when events is empty', () => {
    const events = transformTrackingEvents(makeTender({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('Load in transit')
  })

  it('maps unknown eventType to UNKNOWN', () => {
    const events = transformTrackingEvents(
      makeTender({ events: [makeEvent({ eventType: 'NOPE' })] }),
    )
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('omits location when empty', () => {
    const events = transformTrackingEvents(makeTender({ events: [makeEvent({ location: {} })] }))
    expect(events[0].location).toBeUndefined()
  })

  it('passes metadata through as raw tender object', () => {
    const raw = makeTender()
    const events = transformTrackingEvents(raw)
    expect(events[0].metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    transformTrackingEvents(makeTender()).forEach((evt) => {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    })
  })
})
