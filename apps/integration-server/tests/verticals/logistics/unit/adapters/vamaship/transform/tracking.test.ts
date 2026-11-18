import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type VamashipTrackingResponse,
  type VamashipTrackingActivity,
} from '../../../../../../../src/verticals/logistics/adapters/vamaship/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeActivity(overrides: Partial<VamashipTrackingActivity> = {}): VamashipTrackingActivity {
  return {
    timestamp: '2024-03-01T00:00:00Z',
    status: 'in_transit',
    description: 'Shipment picked up',
    location: 'Mumbai Hub',
    status_code: null,
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<VamashipTrackingResponse> = {},
): VamashipTrackingResponse {
  return {
    awb_number: 'AWB987654321',
    courier_name: 'Delhivery',
    current_status: 'in_transit',
    events: [makeActivity()],
    ...overrides,
  }
}

describe('transformTracking (vamaship)', () => {
  it('returns one event per activity', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'AWB987654321')
    expect(events).toHaveLength(1)
  })

  it('maps trackingNumber from awb_number', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].trackingNumber).toBe('AWB987654321')
  })

  it('maps carrierId from courier_name', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].carrierId).toBe('Delhivery')
  })

  it('maps status "in_transit" to IN_TRANSIT', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps status_code "delivered" to DELIVERED', () => {
    const raw = makeTrackingResponse({
      events: [makeActivity({ status_code: 'delivered', status: null })],
    })
    const events = transformTracking(raw, 'AWB987654321')
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps status "out_for_delivery" to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({
      events: [makeActivity({ status: 'out_for_delivery', status_code: null })],
    })
    const events = transformTracking(raw, 'AWB987654321')
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps description from event.description', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].description).toBe('Shipment picked up')
  })

  it('maps location.city from event.location string', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].location?.city).toBe('Mumbai Hub')
  })

  it('maps occurredAt as a Date', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('uses fallback trackingNumber when awb_number is null', () => {
    const raw = makeTrackingResponse({ awb_number: null })
    const events = transformTracking(raw, 'FALLBACK-AWB')
    expect(events[0].trackingNumber).toBe('FALLBACK-AWB')
  })

  it('generates sequential ids per event index', () => {
    const raw = makeTrackingResponse({
      events: [makeActivity(), makeActivity({ status: 'delivered' })],
    })
    const events = transformTracking(raw, 'AWB987654321')
    expect(events[0].id).toBe('AWB987654321-0')
    expect(events[1].id).toBe('AWB987654321-1')
  })

  it('returns empty array when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw, 'AWB987654321')
    expect(events).toHaveLength(0)
  })

  it('passes TrackingEventSchema.parse on each event without throwing', () => {
    const events = transformTracking(makeTrackingResponse(), 'AWB987654321')
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
