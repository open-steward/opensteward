import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type FlowspaceTrackingResponse,
  type FlowspaceTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/flowspace/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<FlowspaceTrackingEvent> = {}): FlowspaceTrackingEvent {
  return {
    id: 'evt-1',
    status: 'in_transit',
    description: 'Package in transit',
    occurred_at: '2024-03-01T00:00:00Z',
    location: { city: 'Lagos', state: 'LA', country: 'NG', zip: '100001' },
    carrier: 'fedex',
    tracking_number: 'TRK001',
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<FlowspaceTrackingResponse> = {},
): FlowspaceTrackingResponse {
  return {
    order_id: 'ord-001',
    tracking_number: 'TRK001',
    carrier: 'fedex',
    current_status: 'in_transit',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    events: [makeEvent()],
    ...overrides,
  }
}

describe('flowspace transformTrackingResponse', () => {
  it('returns one event per events array entry', () => {
    const raw = makeResponse({ events: [makeEvent(), makeEvent({ status: 'delivered' })] })
    expect(transformTrackingResponse(raw)).toHaveLength(2)
  })

  it('maps trackingNumber and shipmentId from root', () => {
    const result = transformTrackingResponse(makeResponse())
    expect(result[0].trackingNumber).toBe('TRK001')
    expect(result[0].shipmentId).toBe('ord-001')
  })

  it('maps status correctly — in_transit → IN_TRANSIT', () => {
    const result = transformTrackingResponse(makeResponse())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps status correctly — delivered → DELIVERED', () => {
    const result = transformTrackingResponse(
      makeResponse({ events: [makeEvent({ status: 'delivered' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps status correctly — pre_shipment → PRE_TRANSIT', () => {
    const result = transformTrackingResponse(
      makeResponse({ events: [makeEvent({ status: 'pre_shipment' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status correctly — return_to_sender → RETURN_TO_SENDER', () => {
    const result = transformTrackingResponse(
      makeResponse({ events: [makeEvent({ status: 'return_to_sender' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps status correctly — exception → FAILURE', () => {
    const result = transformTrackingResponse(
      makeResponse({ events: [makeEvent({ status: 'exception' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps location fields from event location', () => {
    const result = transformTrackingResponse(makeResponse())
    expect(result[0].location?.city).toBe('Lagos')
    expect(result[0].location?.country).toBe('NG')
    expect(result[0].location?.postalCode).toBe('100001')
  })

  it('maps description from event', () => {
    const result = transformTrackingResponse(makeResponse())
    expect(result[0].description).toBe('Package in transit')
  })

  it('emits a synthetic summary event when events is empty', () => {
    const raw = makeResponse({ events: [] })
    const result = transformTrackingResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].shipmentId).toBe('ord-001')
  })

  it('emits UNKNOWN status on empty events with unknown current_status', () => {
    const raw = makeResponse({ events: [], current_status: 'some_unknown_status' })
    const result = transformTrackingResponse(raw)
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('omits location when event location is null', () => {
    const result = transformTrackingResponse(
      makeResponse({ events: [makeEvent({ location: null })] }),
    )
    expect(result[0].location).toBeUndefined()
  })

  it('omits location when all location fields are null/empty', () => {
    const result = transformTrackingResponse(
      makeResponse({
        events: [makeEvent({ location: { city: null, state: null, country: null, zip: null } })],
      }),
    )
    expect(result[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingResponse(makeResponse())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('passes TrackingEventSchema for the synthetic summary event', () => {
    const result = transformTrackingResponse(makeResponse({ events: [] }))
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
