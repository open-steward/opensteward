import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type GophrUkTrackingResponse,
  type GophrUkTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/gophr-uk/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<GophrUkTrackingEvent> = {}): GophrUkTrackingEvent {
  return {
    timestamp: '2024-03-01T10:30:00Z',
    status: 'collected',
    description: 'Package collected from sender',
    location: { street1: '10 Pickup Lane', city: 'London', country: 'GB' },
    ...overrides,
  }
}

function makeResponse(overrides: Partial<GophrUkTrackingResponse> = {}): GophrUkTrackingResponse {
  return {
    job_id: 'job-001',
    delivery_id: 'delivery-abc',
    status: 'collected',
    status_label: 'Collected',
    external_id: 'EXT-001',
    updated_time: '2024-03-01T10:30:00Z',
    created_time: '2024-03-01T09:00:00Z',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('Gophr UK transformTrackingEvents', () => {
  it('returns one event per event in events array', () => {
    const resp = makeResponse({ events: [makeEvent(), makeEvent({ status: 'delivered' })] })
    expect(transformTrackingEvents(resp)).toHaveLength(2)
  })

  it('sets carrierId to gophr-uk on each event', () => {
    expect(transformTrackingEvents(makeResponse())[0].carrierId).toBe('gophr-uk')
  })

  it('maps shipmentId from job_id', () => {
    expect(transformTrackingEvents(makeResponse())[0].shipmentId).toBe('job-001')
  })

  it('maps trackingNumber from job_id', () => {
    expect(transformTrackingEvents(makeResponse())[0].trackingNumber).toBe('job-001')
  })

  it('falls back to delivery_id for trackingNumber when job_id is missing', () => {
    const result = transformTrackingEvents(makeResponse({ job_id: null }))
    expect(result[0].trackingNumber).toBe('delivery-abc')
  })

  it('maps collected → IN_TRANSIT status via TRACKING_STATUS_MAP', () => {
    expect(transformTrackingEvents(makeResponse())[0].status).toBe('IN_TRANSIT')
  })

  it('maps delivered → DELIVERED status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'delivered' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps new → PRE_TRANSIT status', () => {
    const result = transformTrackingEvents(makeResponse({ events: [makeEvent({ status: 'new' })] }))
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps confirmed → PRE_TRANSIT status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'confirmed' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps out_for_delivery → OUT_FOR_DELIVERY status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'out_for_delivery' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps at_delivery → OUT_FOR_DELIVERY status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'at_delivery' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps returned → RETURN_TO_SENDER status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'returned' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps cancelled → FAILURE status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'cancelled' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps failed → FAILURE status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'failed' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps unknown event status → UNKNOWN', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ status: 'mystery' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps description from event description', () => {
    expect(transformTrackingEvents(makeResponse())[0].description).toBe(
      'Package collected from sender',
    )
  })

  it('maps occurredAt from event timestamp', () => {
    expect(transformTrackingEvents(makeResponse())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to synthetic event when events array is empty', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].description).toBe('Collected')
  })

  it('falls back to updated_time for occurredAt on synthetic event', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to created_time when updated_time is missing on synthetic event', () => {
    const result = transformTrackingEvents(makeResponse({ events: [], updated_time: null }))
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('attaches response as metadata on each event', () => {
    const raw = makeResponse()
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
