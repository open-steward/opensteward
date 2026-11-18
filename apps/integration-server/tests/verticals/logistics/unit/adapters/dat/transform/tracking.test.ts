import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type DatLoadTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/dat/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeResponse(o: Partial<DatLoadTrackingResponse> = {}): DatLoadTrackingResponse {
  return {
    loadId: 'LOAD-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    trackingEvents: [
      {
        eventId: 'evt-1',
        timestamp: '2024-03-01T08:00:00Z',
        statusCode: 'IN_TRANSIT',
        description: 'Truck departed origin',
        location: {
          city: 'Dallas',
          state: 'TX',
          postalCode: '75201',
          country: 'US',
        },
      },
    ],
    ...o,
  }
}

describe('dat transformTrackingEvents', () => {
  it('returns one event per trackingEvent entry', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result).toHaveLength(1)
  })

  it('maps loadId to trackingNumber', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].trackingNumber).toBe('LOAD-001')
  })

  it('maps carrierId to dat', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].carrierId).toBe('dat')
  })

  it('maps IN_TRANSIT statusCode to IN_TRANSIT', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps AT_DELIVERY to OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'AT_DELIVERY',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps DELIVERED statusCode to DELIVERED', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'DELIVERED',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps CANCELLED statusCode to FAILURE', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'CANCELLED',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps AVAILABLE statusCode to PRE_TRANSIT', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'AVAILABLE',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps unknown statusCode to UNKNOWN', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'WEIRD_STATUS',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps description from event', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].description).toBe('Truck departed origin')
  })

  it('maps location fields', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].location?.city).toBe('Dallas')
    expect(result[0].location?.state).toBe('TX')
    expect(result[0].location?.country).toBe('US')
  })

  it('maps timestamp to occurredAt', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns undefined location when location is empty', () => {
    const result = transformTrackingEvents(
      makeResponse({
        trackingEvents: [
          {
            timestamp: '2024-03-01T00:00:00Z',
            statusCode: 'IN_TRANSIT',
            location: {},
          },
        ],
      }),
    )
    expect(result[0].location).toBeUndefined()
  })

  it('returns single fallback event when trackingEvents is empty', () => {
    const result = transformTrackingEvents(makeResponse({ trackingEvents: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].trackingNumber).toBe('LOAD-001')
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('uses statusDescription as description on fallback event', () => {
    const result = transformTrackingEvents(makeResponse({ trackingEvents: [] }))
    expect(result[0].description).toBe('Shipment in transit')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('passes TrackingEventSchema validation for fallback event', () => {
    const result = transformTrackingEvents(makeResponse({ trackingEvents: [] }))
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
