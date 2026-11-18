import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type ShipiumTrackingResponse,
  type ShipiumTrackingEventRaw,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<ShipiumTrackingEventRaw> = {}): ShipiumTrackingEventRaw {
  return {
    carrierDescription: 'Package in transit',
    shipmentStatus: 'in_transit',
    eventDate: '2024-03-01T00:00:00Z',
    city: 'Oakland',
    region: 'CA',
    country: 'US',
    postalCode: '94601',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<ShipiumTrackingResponse> = {}): ShipiumTrackingResponse {
  return {
    shipiumTrackingId: 'trk-001',
    shipiumShipmentId: 'shp-001',
    carrierId: 'fedex',
    carrierTrackingId: 'TRACK-001',
    shipmentStatus: 'in_transit',
    shippedDateTime: '2024-03-01T00:00:00Z',
    deliveredAtDateTime: null,
    trackingEvents: [makeEvent()],
    ...overrides,
  }
}

describe('transformTrackingResponse', () => {
  it('produces one event per trackingEvent entry', () => {
    const result = transformTrackingResponse(makeRaw())
    expect(result).toHaveLength(1)
  })

  it('maps trackingNumber from carrierTrackingId', () => {
    expect(transformTrackingResponse(makeRaw())[0].trackingNumber).toBe('TRACK-001')
  })

  it('maps shipmentId from shipiumShipmentId', () => {
    expect(transformTrackingResponse(makeRaw())[0].shipmentId).toBe('shp-001')
  })

  it('maps carrierId', () => {
    expect(transformTrackingResponse(makeRaw())[0].carrierId).toBe('fedex')
  })

  it('maps IN_TRANSIT status from in_transit', () => {
    expect(transformTrackingResponse(makeRaw())[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from carrierDescription', () => {
    expect(transformTrackingResponse(makeRaw())[0].description).toBe('Package in transit')
  })

  it('maps location city, state, country, postalCode', () => {
    const event = transformTrackingResponse(makeRaw())[0]
    expect(event.location?.city).toBe('Oakland')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.country).toBe('US')
    expect(event.location?.postalCode).toBe('94601')
  })

  it('maps occurredAt from eventDate', () => {
    expect(transformTrackingResponse(makeRaw())[0].occurredAt).toEqual(
      new Date('2024-03-01T00:00:00Z'),
    )
  })

  it('synthesises a summary event when trackingEvents is empty', () => {
    const raw = makeRaw({ trackingEvents: [], shipmentStatus: 'delivered' })
    const result = transformTrackingResponse(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps OUT_FOR_DELIVERY status', () => {
    const raw = makeRaw({
      trackingEvents: [makeEvent({ shipmentStatus: 'out_for_delivery' })],
    })
    expect(transformTrackingResponse(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps FAILURE for exception status', () => {
    const raw = makeRaw({
      trackingEvents: [makeEvent({ shipmentStatus: 'exception' })],
    })
    expect(transformTrackingResponse(raw)[0].status).toBe('FAILURE')
  })

  it('maps RETURN_TO_SENDER for return_to_sender', () => {
    const raw = makeRaw({
      trackingEvents: [makeEvent({ shipmentStatus: 'return_to_sender' })],
    })
    expect(transformTrackingResponse(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('returns undefined location when no location fields present', () => {
    const raw = makeRaw({
      trackingEvents: [makeEvent({ city: null, region: null, country: null, postalCode: null })],
    })
    expect(transformTrackingResponse(raw)[0].location).toBeUndefined()
  })

  it('passes schema validation for each event', () => {
    const events = transformTrackingResponse(makeRaw())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
