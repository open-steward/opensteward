import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type NetworkONTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/networkon/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingEvent(
  overrides: Partial<NetworkONTrackingEvent> = {},
): NetworkONTrackingEvent {
  return {
    id: 'evt-001',
    order_id: 'ship-001',
    tracking_number: 'TRACK-XYZ',
    status: 'in_transit',
    description: 'Package in transit',
    location: { city: 'Chicago', country: 'US' },
    occurred_at: '2024-03-02T10:00:00Z',
    created_at: '2024-03-02T10:00:00Z',
    ...overrides,
  }
}

describe('networkon transformTrackingEvent', () => {
  it('maps id from raw.id as string', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).id).toBe('evt-001')
  })

  it('maps numeric id to string', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ id: 99 })).id).toBe('99')
  })

  it('maps shipmentId from order_id as string', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).shipmentId).toBe('ship-001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).trackingNumber).toBe('TRACK-XYZ')
  })

  it('hardcodes carrierId as "networkon"', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).carrierId).toBe('networkon')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).status).toBe('IN_TRANSIT')
  })

  it('maps status pending → PRE_TRANSIT', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'pending' })).status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('maps status label_created → PRE_TRANSIT', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'label_created' })).status).toBe(
      'PRE_TRANSIT',
    )
  })

  it('maps status out_for_delivery → OUT_FOR_DELIVERY', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('maps status available_for_pickup → AVAILABLE_FOR_PICKUP', () => {
    expect(
      transformTrackingEvent(makeTrackingEvent({ status: 'available_for_pickup' })).status,
    ).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps status returned_to_sender → RETURN_TO_SENDER', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'returned_to_sender' })).status).toBe(
      'RETURN_TO_SENDER',
    )
  })

  it('maps status exception → FAILURE', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'exception' })).status).toBe(
      'FAILURE',
    )
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformTrackingEvent(makeTrackingEvent({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps description', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).description).toBe('Package in transit')
  })

  it('maps location from location object', () => {
    expect(transformTrackingEvent(makeTrackingEvent()).location?.city).toBe('Chicago')
  })

  it('maps occurredAt from occurred_at', () => {
    const result = transformTrackingEvent(makeTrackingEvent())
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back occurredAt to created_at when occurred_at is null', () => {
    const result = transformTrackingEvent(makeTrackingEvent({ occurred_at: null }))
    expect(result.occurredAt).toBeInstanceOf(Date)
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    expect(() =>
      TrackingEventSchema.parse(transformTrackingEvent(makeTrackingEvent())),
    ).not.toThrow()
  })
})
