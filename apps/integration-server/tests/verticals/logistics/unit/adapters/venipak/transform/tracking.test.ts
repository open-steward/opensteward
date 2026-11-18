import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type VenipakTrackingResponse,
  type VenipakTrackingDetail,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDetail(overrides: Partial<VenipakTrackingDetail> = {}): VenipakTrackingDetail {
  return {
    status: '1',
    description: 'Package in transit',
    event_time: '2024-03-01T00:00:00Z',
    location: 'Vilnius hub',
    city: 'Vilnius',
    country: 'LT',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<VenipakTrackingResponse> = {},
): VenipakTrackingResponse {
  return {
    tracking_no: 'VP123456789LT',
    pack_no: null,
    status: '1',
    description: 'In transit',
    event_time: '2024-03-01T00:00:00Z',
    history: [makeDetail()],
    ...overrides,
  }
}

describe('transformTrackingEvents (venipak)', () => {
  it('returns one event per history entry', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events).toHaveLength(1)
  })

  it('maps trackingNumber from tracking_no', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].trackingNumber).toBe('VP123456789LT')
  })

  it('falls back trackingNumber to pack_no', () => {
    const raw = makeTrackingResponse({ tracking_no: null, pack_no: 'VP-PACK-001' })
    const events = transformTrackingEvents(raw)
    expect(events[0].trackingNumber).toBe('VP-PACK-001')
  })

  it('hardcodes carrierId to venipak', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].carrierId).toBe('venipak')
  })

  it('maps status "1" to IN_TRANSIT', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps status "3" to DELIVERED', () => {
    const raw = makeTrackingResponse({ history: [makeDetail({ status: '3' })] })
    const events = transformTrackingEvents(raw)
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps status "2" to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ history: [makeDetail({ status: '2' })] })
    const events = transformTrackingEvents(raw)
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status "4" to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ history: [makeDetail({ status: '4' })] })
    const events = transformTrackingEvents(raw)
    expect(events[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps description from detail.description', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].description).toBe('Package in transit')
  })

  it('maps location from city and country', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].location?.city).toBe('Vilnius')
    expect(events[0].location?.country).toBe('LT')
  })

  it('maps occurredAt as a Date from event_time', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits a summary event when history is absent', () => {
    const raw = makeTrackingResponse({ history: null })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In transit')
  })

  it('handles non-array history (single object)', () => {
    const raw = makeTrackingResponse({ history: makeDetail() })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('passes TrackingEventSchema.parse on each event without throwing', () => {
    const events = transformTrackingEvents(makeTrackingResponse())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
