import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  mapStatus,
  type GoCometTrackingResponse,
  type GoCometTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/gocomet/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<GoCometTrackingEvent> = {}): GoCometTrackingEvent {
  return {
    event_type: 'LOADED',
    description: 'Container loaded onto vessel',
    timestamp: '2024-03-01T06:00:00Z',
    location: {
      name: 'Shanghai Port',
      city: 'Shanghai',
      country: 'CN',
      un_locode: 'CNSHA',
    },
    ...overrides,
  }
}

function makeResponse(overrides: Partial<GoCometTrackingResponse> = {}): GoCometTrackingResponse {
  return {
    container_number: 'MSCU1234567',
    bill_of_lading: 'BL-2024-001',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('GoComet mapStatus', () => {
  it('LOADED → IN_TRANSIT', () => expect(mapStatus('LOADED')).toBe('IN_TRANSIT'))
  it('DEPARTED → IN_TRANSIT', () => expect(mapStatus('DEPARTED')).toBe('IN_TRANSIT'))
  it('SAILING → IN_TRANSIT', () => expect(mapStatus('SAILING')).toBe('IN_TRANSIT'))
  it('IN_TRANSIT → IN_TRANSIT', () => expect(mapStatus('IN_TRANSIT')).toBe('IN_TRANSIT'))
  it('ARRIVED → IN_TRANSIT', () => expect(mapStatus('ARRIVED')).toBe('IN_TRANSIT'))
  it('DISCHARG → IN_TRANSIT', () => expect(mapStatus('DISCHARG')).toBe('IN_TRANSIT'))
  it('EMPTY → PRE_TRANSIT', () => expect(mapStatus('EMPTY')).toBe('PRE_TRANSIT'))
  it('GATE_OUT → PRE_TRANSIT', () => expect(mapStatus('GATE_OUT')).toBe('PRE_TRANSIT'))
  it('GATE_IN → OUT_FOR_DELIVERY', () => expect(mapStatus('GATE_IN')).toBe('OUT_FOR_DELIVERY'))
  it('OUT_FOR_DELIVERY → OUT_FOR_DELIVERY', () =>
    expect(mapStatus('OUT_FOR_DELIVERY')).toBe('OUT_FOR_DELIVERY'))
  it('DELIVERED → DELIVERED', () => expect(mapStatus('DELIVERED')).toBe('DELIVERED'))
  it('DELIVERY_DONE → DELIVERED', () => expect(mapStatus('DELIVERY_DONE')).toBe('DELIVERED'))
  it('FAIL → FAILURE', () => expect(mapStatus('FAIL')).toBe('FAILURE'))
  it('EXCEPTION → FAILURE', () => expect(mapStatus('EXCEPTION')).toBe('FAILURE'))
  it('DELAY → FAILURE', () => expect(mapStatus('DELAY')).toBe('FAILURE'))
  it('RETURN → RETURN_TO_SENDER', () => expect(mapStatus('RETURN')).toBe('RETURN_TO_SENDER'))
  it('null → UNKNOWN', () => expect(mapStatus(null)).toBe('UNKNOWN'))
  it('unknown string → UNKNOWN', () => expect(mapStatus('MYSTERY')).toBe('UNKNOWN'))
})

describe('GoComet transformTracking', () => {
  it('returns one event per event in the events array', () => {
    const resp = makeResponse({ events: [makeEvent(), makeEvent({ event_type: 'DEPARTED' })] })
    expect(transformTracking(resp)).toHaveLength(2)
  })

  it('maps carrierId to gocomet on each event', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].carrierId).toBe('gocomet')
  })

  it('maps trackingNumber from container_number', () => {
    expect(transformTracking(makeResponse())[0].trackingNumber).toBe('MSCU1234567')
  })

  it('maps status from event_type', () => {
    expect(
      transformTracking(makeResponse({ events: [makeEvent({ event_type: 'LOADED' })] }))[0].status,
    ).toBe('IN_TRANSIT')
  })

  it('falls back to event_code when event_type is missing', () => {
    const evt = makeEvent({ event_type: undefined, event_code: 'DELIVERED' })
    expect(transformTracking(makeResponse({ events: [evt] }))[0].status).toBe('DELIVERED')
  })

  it('maps description from event description', () => {
    expect(transformTracking(makeResponse())[0].description).toBe('Container loaded onto vessel')
  })

  it('maps location.city from event location', () => {
    expect(transformTracking(makeResponse())[0].location?.city).toBe('Shanghai')
  })

  it('maps location.country from event location', () => {
    expect(transformTracking(makeResponse())[0].location?.country).toBe('CN')
  })

  it('maps location.postalCode from un_locode', () => {
    expect(transformTracking(makeResponse())[0].location?.postalCode).toBe('CNSHA')
  })

  it('maps occurredAt from timestamp', () => {
    expect(transformTracking(makeResponse())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to event_time when timestamp is missing', () => {
    const evt = makeEvent({ timestamp: null, event_time: '2024-03-01T06:00:00Z' })
    expect(transformTracking(makeResponse({ events: [evt] }))[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns synthetic UNKNOWN event when events array is empty', () => {
    const result = transformTracking(makeResponse({ events: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('UNKNOWN')
    expect(result[0].trackingNumber).toBe('MSCU1234567')
  })

  it('returns synthetic UNKNOWN event when events is undefined via tracking_events fallback', () => {
    const resp = makeResponse({ events: undefined, tracking_events: [makeEvent()] })
    const result = transformTracking(resp)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const events = transformTracking(makeResponse())
    for (const evt of events) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })
})
