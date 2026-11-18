import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type TerminalAfricaTrackingResponse,
  type TerminalAfricaTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(
  overrides: Partial<TerminalAfricaTrackingEvent> = {},
): TerminalAfricaTrackingEvent {
  return {
    status: 'in_transit',
    description: 'Package in transit',
    location: { line1: '3rd Mainland Bridge', city: 'Lagos', country: 'NG' },
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<TerminalAfricaTrackingResponse> = {},
): TerminalAfricaTrackingResponse {
  return {
    shipment_id: 'shp-001',
    carrier_tracking_number: 'TRK999',
    tracking_number: 'TRK-fallback',
    carrier_slug: 'dhl',
    status: 'in_transit',
    events: [makeEvent()],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('terminal-africa transformTrackingEvents', () => {
  it('produces one event per entry in events array', () => {
    const r = transformTrackingEvents(makeResponse({ events: [makeEvent(), makeEvent()] }))
    expect(r).toHaveLength(2)
  })

  it('maps shipment_id → shipmentId', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].shipmentId).toBe('shp-001')
  })

  it('maps carrier_tracking_number → trackingNumber', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].trackingNumber).toBe('TRK999')
  })

  it('maps carrier_slug → carrierId', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].carrierId).toBe('dhl')
  })

  it('maps in_transit → IN_TRANSIT', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from event', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].description).toBe('Package in transit')
  })

  it('maps event location via transformAddress', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].location?.city).toBe('Lagos')
  })

  it('maps event created_at → occurredAt as Date', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits synthetic event from tracking_status when events is empty', () => {
    const r = transformTrackingEvents(
      makeResponse({
        events: [],
        status: 'delivered',
        tracking_status: {
          status: 'delivered',
          description: 'Delivered to recipient',
          location: { city: 'Abuja', country: 'NG' },
          created_at: '2024-03-02T00:00:00Z',
        },
      }),
    )
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
    expect(r[0].description).toBe('Delivered to recipient')
    expect(r[0].location?.city).toBe('Abuja')
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['pre_transit', 'PRE_TRANSIT'],
      ['pre-transit', 'PRE_TRANSIT'],
      ['pending', 'PRE_TRANSIT'],
      ['draft', 'PRE_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['in-transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['out-for-delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['available-for-pickup', 'AVAILABLE_FOR_PICKUP'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['returned', 'RETURN_TO_SENDER'],
      ['exception', 'FAILURE'],
      ['failure', 'FAILURE'],
      ['cancelled', 'FAILURE'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      const r = transformTrackingEvents(makeResponse({ events: [makeEvent({ status: s })] }))
      expect(r[0].status).toBe(expected)
    }
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvents(makeResponse())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('handles null event location', () => {
    const r = transformTrackingEvents(makeResponse({ events: [makeEvent({ location: null })] }))
    expect(r[0].location).toBeUndefined()
    expect(() => TrackingEventSchema.parse(r[0])).not.toThrow()
  })
})
