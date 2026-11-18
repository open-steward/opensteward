import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type DaVinciTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/da-vinci-unified/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingResponse(o: Partial<DaVinciTrackingResponse> = {}): DaVinciTrackingResponse {
  return {
    ShipmentId: 301,
    TrackingNumber: 'TRACK-ABC123',
    CarrierCode: 'FEDEX',
    Events: [
      {
        EventCode: 'IN_TRANSIT',
        EventDescription: 'Package in transit',
        EventDate: '2024-03-01T10:00:00Z',
        City: 'Dallas',
        State: 'TX',
        Country: 'US',
        PostalCode: '75201',
      },
    ],
    ...o,
  }
}

describe('da-vinci-unified transformTracking', () => {
  it('maps one event per DaVinciTrackingEvent', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result).toHaveLength(1)
  })

  it('maps ShipmentId to string shipmentId', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].shipmentId).toBe('301')
  })

  it('maps TrackingNumber', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].trackingNumber).toBe('TRACK-ABC123')
  })

  it('maps CarrierCode to carrierId', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].carrierId).toBe('FEDEX')
  })

  it('defaults carrierId to da-vinci-unified when CarrierCode absent', () => {
    const result = transformTracking(makeTrackingResponse({ CarrierCode: null }))
    expect(result[0].carrierId).toBe('da-vinci-unified')
  })

  it('maps IN_TRANSIT EventCode to IN_TRANSIT status', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps delivered EventCode to DELIVERED', () => {
    const result = transformTracking(
      makeTrackingResponse({
        Events: [
          {
            EventCode: 'DELIVERED',
            EventDate: '2024-03-02T00:00:00Z',
            timestamp: '2024-03-02T00:00:00Z',
          },
        ],
      }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps EventDescription to description', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].description).toBe('Package in transit')
  })

  it('maps location fields', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].location?.city).toBe('Dallas')
    expect(result[0].location?.state).toBe('TX')
    expect(result[0].location?.country).toBe('US')
  })

  it('maps EventDate to occurredAt', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns one UNKNOWN event when events array is empty', () => {
    const result = transformTracking(makeTrackingResponse({ Events: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeTrackingResponse())
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })

  it('passes TrackingEventSchema validation for empty events fallback', () => {
    const result = transformTracking(makeTrackingResponse({ Events: [] }))
    expect(() => TrackingEventSchema.parse(result[0])).not.toThrow()
  })
})
