import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type E2openShipmentTrackingResponse,
  type E2openTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/e2open/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeResponse(
  o: Partial<E2openShipmentTrackingResponse> = {},
): E2openShipmentTrackingResponse {
  return {
    shipmentId: 'e2o-shp-200',
    trackingNumber: 'TRK-E2O-200',
    currentStatus: 'IN_TRANSIT',
    currentStatusDescription: 'In transit to destination',
    carrier: 'ups',
    events: [],
    ...o,
  }
}

function makeEvent(o: Partial<E2openTrackingEventRaw> = {}): E2openTrackingEventRaw {
  return {
    eventCode: 'IN_TRANSIT',
    description: 'Departed facility',
    eventDateTime: '2024-03-01T10:00:00Z',
    location: {
      city: 'Denver',
      stateProvince: 'CO',
      countryCode: 'US',
    },
    ...o,
  }
}

describe('e2open transformTrackingEvents', () => {
  it('returns synthetic event when events array is empty', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result).toHaveLength(1)
  })

  it('synthetic event uses currentStatus IN_TRANSIT → IN_TRANSIT', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('synthetic event uses currentStatusDescription', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result[0].description).toBe('In transit to destination')
  })

  it('synthetic event uses trackingNumber', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result[0].trackingNumber).toBe('TRK-E2O-200')
  })

  it('synthetic event uses carrier for carrierId', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result[0].carrierId).toBe('ups')
  })

  it('falls back to carrierId param when carrier absent', () => {
    const result = transformTrackingEvents(
      makeResponse({ carrier: undefined, events: [] }),
      'e2open',
    )
    expect(result[0].carrierId).toBe('e2open')
  })

  it('maps real events when present', () => {
    const response = makeResponse({ events: [makeEvent(), makeEvent({ eventCode: 'DELIVERED' })] })
    const result = transformTrackingEvents(response)
    expect(result).toHaveLength(2)
  })

  it('PLANNED eventCode → PRE_TRANSIT', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'PLANNED' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('OUT_FOR_DELIVERY eventCode → OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'OUT_FOR_DELIVERY' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('DELIVERED eventCode → DELIVERED', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'DELIVERED' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('EXCEPTION eventCode → FAILURE', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'EXCEPTION' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('RETURNED eventCode → RETURN_TO_SENDER', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'RETURNED' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('unknown eventCode → UNKNOWN', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'BOGUS' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps event description', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent()] }))
    expect(result[0].description).toBe('Departed facility')
  })

  it('maps event location city', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent()] }))
    expect(result[0].location?.city).toBe('Denver')
  })

  it('maps event location state', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent()] }))
    expect(result[0].location?.state).toBe('CO')
  })

  it('parses occurredAt as Date', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent()] }))
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('location is undefined when all location fields absent', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent({ location: {} })] }))
    expect(result[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema validation (synthetic)', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('passes TrackingEventSchema validation (real event)', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent()] }))
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('metadata of real event is the raw event object', () => {
    const evt = makeEvent()
    const result = transformTrackingEvents(makeResponse({ events: [evt] }))
    expect(result[0].metadata).toBe(evt)
  })
})
