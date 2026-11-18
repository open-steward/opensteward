import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type VeraCoreTrackingResponse,
  type VeraCoreTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/veracore/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<VeraCoreTrackingEvent> = {}): VeraCoreTrackingEvent {
  return {
    Status: 'In Transit',
    Description: 'Package departed facility',
    EventDate: '2024-03-01T00:00:00Z',
    EventDateTime: '2024-03-01T00:00:00Z',
    City: 'Memphis',
    State: 'TN',
    Country: 'US',
    PostalCode: '38101',
    ...overrides,
  }
}

function makeTrackingResponse(
  overrides: Partial<VeraCoreTrackingResponse> = {},
): VeraCoreTrackingResponse {
  return {
    ShipmentID: 'VCS-2024-001',
    TrackingNumber: 'TRK123456789',
    CarrierCode: 'UPS',
    Events: [makeEvent()],
    ...overrides,
  }
}

describe('transformTracking (veracore)', () => {
  it('returns one event per Events entry', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events).toHaveLength(1)
  })

  it('maps shipmentId from ShipmentID', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].shipmentId).toBe('VCS-2024-001')
  })

  it('maps trackingNumber from TrackingNumber', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].trackingNumber).toBe('TRK123456789')
  })

  it('maps carrierId from CarrierCode', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].carrierId).toBe('UPS')
  })

  it('falls back carrierId to "veracore" when CarrierCode is absent', () => {
    const events = transformTracking(makeTrackingResponse({ CarrierCode: null }))
    expect(events[0].carrierId).toBe('veracore')
  })

  it('maps status "In Transit" to IN_TRANSIT', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps status "Delivered" to DELIVERED', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ Status: 'Delivered' })],
      }),
    )
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps status "Out for Delivery" to OUT_FOR_DELIVERY', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ Status: 'Out for Delivery' })],
      }),
    )
    expect(events[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps status "Return to Sender" to RETURN_TO_SENDER', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ Status: 'Return to Sender' })],
      }),
    )
    expect(events[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps status "Exception" to FAILURE', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ Status: 'Exception' })],
      }),
    )
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps description from Description', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].description).toBe('Package departed facility')
  })

  it('maps location from City, State, Country, PostalCode', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].location?.city).toBe('Memphis')
    expect(events[0].location?.state).toBe('TN')
    expect(events[0].location?.country).toBe('US')
    expect(events[0].location?.postalCode).toBe('38101')
  })

  it('maps occurredAt from EventDateTime as a Date', () => {
    const events = transformTracking(makeTrackingResponse())
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back occurredAt to EventDate when EventDateTime is absent', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ EventDateTime: null })],
      }),
    )
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('returns a single UNKNOWN event when Events is empty', () => {
    const events = transformTracking(makeTrackingResponse({ Events: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('omits location when all location fields are absent', () => {
    const events = transformTracking(
      makeTrackingResponse({
        Events: [makeEvent({ City: null, State: null, Country: null, PostalCode: null })],
      }),
    )
    expect(events[0].location).toBeUndefined()
  })

  it('passes TrackingEventSchema.parse on each event without throwing', () => {
    const events = transformTracking(makeTrackingResponse())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
