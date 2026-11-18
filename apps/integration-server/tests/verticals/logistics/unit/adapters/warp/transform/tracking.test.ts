import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type WarpEventsResponse,
  type WarpTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/warp/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEventsResponse(overrides: Partial<WarpEventsResponse> = {}): WarpEventsResponse {
  return {
    shipment_id: 'shp-warp-001',
    events: {
      data: [
        {
          eventName: 'pickupSuccessful',
          message: 'Pickup completed',
          when: '2024-03-01T00:00:00Z',
          location: {
            city: 'Los Angeles',
            state: 'CA',
            zipCode: '90210',
          },
        },
        {
          eventName: 'inRouteToDelivery',
          message: 'In transit to destination',
          when: '2024-03-03T00:00:00Z',
          location: {
            city: 'Phoenix',
            state: 'AZ',
            zipCode: '85001',
          },
        },
      ],
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<WarpTrackingResponse> = {}): WarpTrackingResponse {
  return {
    shipment_id: 'shp-warp-001',
    shipment_number: 'SHP-2024-001',
    tracking_number: 'TRK-2024-001',
    mode: 'ltl',
    status: 'booked',
    origin_zip: '90210',
    destination_zip: '10001',
    pickup_date: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-05T00:00:00Z',
    booked_at: '2024-03-01T00:00:00Z',
    cancelled_at: null,
    ...overrides,
  }
}

describe('transformTrackingEvents (warp)', () => {
  it('returns one event per data entry', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result).toHaveLength(2)
  })

  it('maps trackingNumber from eventsResponse.shipment_id', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.trackingNumber).toBe('shp-warp-001')
  })

  it('sets carrierId to warp', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.carrierId).toBe('warp')
  })

  it('maps pickupSuccessful → IN_TRANSIT', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.status).toBe('IN_TRANSIT')
  })

  it('maps inRouteToDelivery → OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[1]?.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps delivered → DELIVERED', () => {
    const eventsRes = makeEventsResponse({
      events: {
        data: [{ eventName: 'delivered', message: 'Delivered', when: '2024-03-05T00:00:00Z' }],
      },
    })
    const result = transformTrackingEvents(eventsRes)
    expect(result[0]?.status).toBe('DELIVERED')
  })

  it('maps exception → FAILURE', () => {
    const eventsRes = makeEventsResponse({
      events: {
        data: [{ eventName: 'exception', message: 'Exception', when: '2024-03-04T00:00:00Z' }],
      },
    })
    const result = transformTrackingEvents(eventsRes)
    expect(result[0]?.status).toBe('FAILURE')
  })

  it('maps unknown eventName → UNKNOWN', () => {
    const eventsRes = makeEventsResponse({
      events: {
        data: [{ eventName: 'weirdEvent', message: 'Unknown', when: '2024-03-02T00:00:00Z' }],
      },
    })
    const result = transformTrackingEvents(eventsRes)
    expect(result[0]?.status).toBe('UNKNOWN')
  })

  it('maps description from message', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.description).toBe('Pickup completed')
  })

  it('maps occurredAt to a Date', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.occurredAt).toBeInstanceOf(Date)
  })

  it('maps location city, state, postalCode', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.location?.city).toBe('Los Angeles')
    expect(result[0]?.location?.state).toBe('CA')
    expect(result[0]?.location?.postalCode).toBe('90210')
  })

  it('sets location country to US', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    expect(result[0]?.location?.country).toBe('US')
  })

  it('returns undefined location when location has no fields', () => {
    const eventsRes = makeEventsResponse({
      events: { data: [{ eventName: 'booked', when: '2024-03-01T00:00:00Z', location: {} }] },
    })
    const result = transformTrackingEvents(eventsRes)
    expect(result[0]?.location).toBeUndefined()
  })

  it('synthesises a synthetic event from trackingRes when events.data is empty', () => {
    const emptyEvents: WarpEventsResponse = {
      shipment_id: 'shp-warp-001',
      events: { data: [] },
    }
    const result = transformTrackingEvents(emptyEvents, makeTrackingResponse())
    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('PRE_TRANSIT') // booked → PRE_TRANSIT
  })

  it('uses trackingRes.tracking_number as trackingNumber for synthetic event', () => {
    const emptyEvents: WarpEventsResponse = { shipment_id: undefined, events: { data: [] } }
    const result = transformTrackingEvents(emptyEvents, makeTrackingResponse())
    expect(result[0]?.trackingNumber).toBe('TRK-2024-001')
  })

  it('each event passes TrackingEventSchema', () => {
    const result = transformTrackingEvents(makeEventsResponse())
    for (const evt of result) {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    }
  })
})
