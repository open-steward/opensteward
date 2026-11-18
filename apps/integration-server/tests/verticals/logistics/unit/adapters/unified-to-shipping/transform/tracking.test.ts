import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type UnifiedShippingTracking,
  type UnifiedShippingTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingEvent(
  overrides: Partial<UnifiedShippingTrackingEvent> = {},
): UnifiedShippingTrackingEvent {
  return {
    status: 'IN_TRANSIT',
    description: 'Package in transit',
    locationName: 'Portland Hub',
    locationAddress: {
      city: 'Portland',
      region: 'OR',
      postalCode: '97201',
      countryCode: 'US',
    },
    createdAt: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

function makeTracking(overrides: Partial<UnifiedShippingTracking> = {}): UnifiedShippingTracking {
  return {
    id: 'TRK-U-001',
    trackingNumber: 'TN-001',
    shipmentId: 'SHP-U-001',
    carrierId: 'usps',
    status: 'IN_TRANSIT',
    statusDescription: 'In transit to destination',
    events: [makeTrackingEvent()],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('unified-to-shipping transformTracking', () => {
  it('produces one event per raw event', () => {
    expect(transformTracking(makeTracking())).toHaveLength(1)
  })

  it('maps shipmentId on each event', () => {
    expect(transformTracking(makeTracking())[0].shipmentId).toBe('SHP-U-001')
  })

  it('maps trackingNumber on each event', () => {
    expect(transformTracking(makeTracking())[0].trackingNumber).toBe('TN-001')
  })

  it('maps carrierId on each event', () => {
    expect(transformTracking(makeTracking())[0].carrierId).toBe('usps')
  })

  it('maps IN_TRANSIT event status to IN_TRANSIT', () => {
    // mapTrackingStatus: 'IN_TRANSIT' → 'IN_TRANSIT'
    expect(transformTracking(makeTracking())[0].status).toBe('IN_TRANSIT')
  })

  it('maps PENDING status to PRE_TRANSIT', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'PENDING' })] }),
    )
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('maps DELIVERED status to DELIVERED', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'DELIVERED' })] }),
    )
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps HELD_AT_LOCATION to AVAILABLE_FOR_PICKUP', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'HELD_AT_LOCATION' })] }),
    )
    expect(events[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps RETURNED_TO_SENDER to RETURN_TO_SENDER', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'RETURNED_TO_SENDER' })] }),
    )
    expect(events[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps EXCEPTION to FAILURE', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'EXCEPTION' })] }),
    )
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const events = transformTracking(
      makeTracking({ events: [makeTrackingEvent({ status: 'NOPE' })] }),
    )
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('maps description', () => {
    expect(transformTracking(makeTracking())[0].description).toBe('Package in transit')
  })

  it('maps location city, state, country from locationAddress', () => {
    const loc = transformTracking(makeTracking())[0].location
    expect(loc?.city).toBe('Portland')
    expect(loc?.state).toBe('OR')
    expect(loc?.country).toBe('US')
  })

  it('maps location name from locationName', () => {
    expect(transformTracking(makeTracking())[0].location?.name).toBe('Portland Hub')
  })

  it('maps occurredAt as Date', () => {
    expect(transformTracking(makeTracking())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits summary event when events is empty', () => {
    const events = transformTracking(makeTracking({ events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].id).toBe('TRK-U-001')
    expect(events[0].status).toBe('IN_TRANSIT')
    expect(events[0].description).toBe('In transit to destination')
  })

  it('passes metadata through on each event', () => {
    const raw = makeTracking()
    transformTracking(raw).forEach((evt) => expect(evt.metadata).toBe(raw))
  })

  it('produces schema-valid output', () => {
    transformTracking(makeTracking()).forEach((evt) => {
      expect(() => TrackingEventSchema.parse(evt)).not.toThrow()
    })
  })
})
