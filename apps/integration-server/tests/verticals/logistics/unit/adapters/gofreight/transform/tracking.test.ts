import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type GoFreightTrackingResponse,
  type GoFreightTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/gofreight/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<GoFreightTrackingEvent> = {}): GoFreightTrackingEvent {
  return {
    timestamp: '2024-03-05T06:00:00Z',
    event_type: 'in_transit',
    description: 'Shipment in transit to destination',
    location: { city: 'Shanghai', country: 'CN' },
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<GoFreightTrackingResponse> = {},
): GoFreightTrackingResponse {
  return {
    ref: 'REF-MB-001',
    tracking_number: 'MBL-2024-001',
    status: 'in_transit',
    status_description: 'In transit to destination',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('GoFreight transformTrackingEvents', () => {
  it('returns one event per event in the events array', () => {
    const resp = makeResponse({
      events: [makeEvent(), makeEvent({ event_type: 'delivered' })],
    })
    expect(transformTrackingEvents(resp)).toHaveLength(2)
  })

  it('maps carrierId to gofreight on each event', () => {
    expect(transformTrackingEvents(makeResponse())[0].carrierId).toBe('gofreight')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformTrackingEvents(makeResponse())[0].trackingNumber).toBe('MBL-2024-001')
  })

  it('falls back to ref for trackingNumber when tracking_number is missing', () => {
    const result = transformTrackingEvents(makeResponse({ tracking_number: undefined }))
    expect(result[0].trackingNumber).toBe('REF-MB-001')
  })

  it('maps in_transit → IN_TRANSIT status via TRACKING_STATUS_MAP', () => {
    expect(transformTrackingEvents(makeResponse())[0].status).toBe('IN_TRANSIT')
  })

  it('maps delivered → DELIVERED status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'delivered' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps out_for_delivery → OUT_FOR_DELIVERY status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'out_for_delivery' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps pre_transit → PRE_TRANSIT status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'pre_transit' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps failure → FAILURE status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'failure' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps exception → FAILURE status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'exception' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps return_to_sender → RETURN_TO_SENDER status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'return_to_sender' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown event_type → UNKNOWN status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: 'mystery' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('falls back to description when event_type is missing for status lookup', () => {
    // description "mystery" will not match any key → UNKNOWN
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ event_type: undefined, description: 'mystery desc' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps description from event description', () => {
    expect(transformTrackingEvents(makeResponse())[0].description).toBe(
      'Shipment in transit to destination',
    )
  })

  it('maps location.city from event location', () => {
    expect(transformTrackingEvents(makeResponse())[0].location?.city).toBe('Shanghai')
  })

  it('maps location.country from event location', () => {
    expect(transformTrackingEvents(makeResponse())[0].location?.country).toBe('CN')
  })

  it('maps occurredAt from event timestamp', () => {
    expect(transformTrackingEvents(makeResponse())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns synthetic event when events array is empty', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].description).toBe('In transit to destination')
  })

  it('returns synthetic UNKNOWN when events is empty and status is missing', () => {
    const result = transformTrackingEvents(makeResponse({ events: [], status: undefined }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('attaches event as metadata on each event', () => {
    const evt = makeEvent()
    const result = transformTrackingEvents(makeResponse({ events: [evt] }))
    expect(result[0].metadata).toBe(evt)
  })

  it('attaches response as metadata on synthetic event', () => {
    const raw = makeResponse({ events: [] })
    const result = transformTrackingEvents(raw)
    expect(result[0].metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const events = transformTrackingEvents(makeResponse())
    for (const evt of events) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })
})
