import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type MothershipTrackingEventRaw,
  type MothershipTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/mothership/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(
  overrides: Partial<MothershipTrackingEventRaw> = {},
): MothershipTrackingEventRaw {
  return {
    timestamp: '2024-03-01T00:00:00Z',
    status: 'in_transit',
    eventType: 'In Transit',
    city: 'Dallas',
    state: 'TX',
    shipmentReferenceNumber: 'REF-100',
    proNumber: 'PRO-888',
    ...overrides,
  }
}

function makeTracking(
  overrides: Partial<MothershipTrackingResponse> = {},
): MothershipTrackingResponse {
  return {
    data: { results: [makeEvent()] },
    ...overrides,
  }
}

describe('transformTrackingEvents (mothership)', () => {
  it('returns one event per result', () => {
    const raw = makeTracking({
      data: { results: [makeEvent(), makeEvent({ status: 'delivered' })] },
    })
    expect(transformTrackingEvents(raw, 'shp-1')).toHaveLength(2)
  })

  it('maps shipmentId from argument', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-abc')[0].shipmentId).toBe('shp-abc')
  })

  it('maps carrierId to "mothership"', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-1')[0].carrierId).toBe('mothership')
  })

  it('maps trackingNumber from shipmentReferenceNumber', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-1')[0].trackingNumber).toBe('REF-100')
  })

  it('maps status IN_TRANSIT for "in_transit"', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-1')[0].status).toBe('IN_TRANSIT')
  })

  it('maps status DELIVERED for "delivered"', () => {
    const raw = makeTracking({ data: { results: [makeEvent({ status: 'delivered' })] } })
    expect(transformTrackingEvents(raw, 'shp-1')[0].status).toBe('DELIVERED')
  })

  it('maps status OUT_FOR_DELIVERY for "out_for_delivery"', () => {
    const raw = makeTracking({ data: { results: [makeEvent({ status: 'out_for_delivery' })] } })
    expect(transformTrackingEvents(raw, 'shp-1')[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status PRE_TRANSIT for "booked"', () => {
    const raw = makeTracking({ data: { results: [makeEvent({ status: 'booked' })] } })
    expect(transformTrackingEvents(raw, 'shp-1')[0].status).toBe('PRE_TRANSIT')
  })

  it('maps description from eventType', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-1')[0].description).toBe('In Transit')
  })

  it('maps location from city and state', () => {
    const evt = transformTrackingEvents(makeTracking(), 'shp-1')[0]
    expect(evt.location?.city).toBe('Dallas')
    expect(evt.location?.state).toBe('TX')
  })

  it('maps occurredAt from timestamp as Date', () => {
    expect(transformTrackingEvents(makeTracking(), 'shp-1')[0].occurredAt).toBeInstanceOf(Date)
  })

  it('supports bare results (no data wrapper)', () => {
    const raw: MothershipTrackingResponse = { results: [makeEvent()] }
    expect(transformTrackingEvents(raw, 'shp-1')).toHaveLength(1)
  })

  it('emits single UNKNOWN fallback event when results empty', () => {
    const raw = makeTracking({ data: { results: [] } })
    const events = transformTrackingEvents(raw, 'shp-1')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('produces TrackingEventSchema-valid results', () => {
    const events = transformTrackingEvents(makeTracking(), 'shp-1')
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
