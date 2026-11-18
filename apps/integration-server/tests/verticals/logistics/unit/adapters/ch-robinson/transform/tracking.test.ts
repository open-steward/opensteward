import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type CHRTrackingResponse,
  type CHRTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/ch-robinson/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<CHRTrackingEvent> = {}): CHRTrackingEvent {
  return {
    eventCode: 'PickedUp',
    statusCode: 'PickedUp',
    description: 'Shipment picked up',
    occurredAt: '2024-03-01T00:00:00Z',
    location: {
      city: 'Chicago',
      stateProvince: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    ...overrides,
  }
}

function makeRaw(overrides: Partial<CHRTrackingResponse> = {}): CHRTrackingResponse {
  return {
    loadId: 'LOAD-001',
    proNumber: 'PRO-001',
    currentStatus: 'InTransit',
    statusDescription: 'In transit',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('ch-robinson transformTrackingEvents', () => {
  it('returns one event per entry in events', () => {
    const result = transformTrackingEvents(makeRaw())
    expect(result).toHaveLength(1)
  })

  it('maps carrierId to ch-robinson', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(e.carrierId).toBe('ch-robinson'))
  })

  it('maps proNumber to trackingNumber', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(e.trackingNumber).toBe('PRO-001'))
  })

  it('maps PickedUp statusCode to IN_TRANSIT via TRACKING_STATUS_MAP', () => {
    // TRACKING_STATUS_MAP maps 'PickedUp' → 'IN_TRANSIT'
    expect(transformTrackingEvents(makeRaw())[0].status).toBe('IN_TRANSIT')
  })

  it('maps InTransit statusCode to IN_TRANSIT', () => {
    const result = transformTrackingEvents(
      makeRaw({ events: [makeEvent({ statusCode: 'InTransit' })] }),
    )
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps OutForDelivery statusCode to OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(
      makeRaw({ events: [makeEvent({ statusCode: 'OutForDelivery' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Delivered statusCode to DELIVERED', () => {
    const result = transformTrackingEvents(
      makeRaw({ events: [makeEvent({ statusCode: 'Delivered' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps Exception statusCode to FAILURE', () => {
    const result = transformTrackingEvents(
      makeRaw({ events: [makeEvent({ statusCode: 'Exception' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps description to description', () => {
    expect(transformTrackingEvents(makeRaw())[0].description).toBe('Shipment picked up')
  })

  it('maps location city/state/postalCode', () => {
    const loc = transformTrackingEvents(makeRaw())[0].location
    expect(loc?.city).toBe('Chicago')
    expect(loc?.state).toBe('IL')
    expect(loc?.postalCode).toBe('60601')
  })

  it('maps occurredAt to occurredAt as Date', () => {
    expect(transformTrackingEvents(makeRaw())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('combines stops and events', () => {
    const result = transformTrackingEvents(
      makeRaw({
        events: [makeEvent()],
        stops: [makeEvent({ statusCode: 'Delivered', description: 'Delivered at door' })],
      }),
    )
    expect(result).toHaveLength(2)
  })

  it('synthesises fallback event when no events or stops', () => {
    const result = transformTrackingEvents(makeRaw({ events: undefined, stops: undefined }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT') // currentStatus = 'InTransit' → IN_TRANSIT
    expect(result[0].trackingNumber).toBe('PRO-001')
  })

  it('all events satisfy TrackingEventSchema', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
