import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type Route4MeRouteDestination,
} from '../../../../../../../src/verticals/logistics/adapters/route4me/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDestination(
  overrides: Partial<Route4MeRouteDestination> = {},
): Route4MeRouteDestination {
  return {
    route_destination_id: 'DEST-001',
    route_id: 'ROUTE-001',
    alias: 'Customer Stop',
    first_name: 'Bob',
    last_name: 'Builder',
    address: '99 Build Ave',
    city: 'Denver',
    state: 'CO',
    country_id: 'US',
    zip: '80201',
    is_depot: false,
    is_visited: false,
    is_departed: false,
    is_accepted: false,
    timestamp_last_visited: null,
    timestamp_last_departed: null,
    notes: [{ note_id: 'N-1', note: 'Ring doorbell', created_at: null }],
    ...overrides,
  }
}

describe('route4me transformTrackingEvents', () => {
  it('produces one event per non-depot destination', () => {
    const events = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(events).toHaveLength(1)
  })

  it('filters out depot stops', () => {
    const events = transformTrackingEvents(
      [makeDestination({ is_depot: true }), makeDestination()],
      'ROUTE-001',
    )
    expect(events).toHaveLength(1)
  })

  it('maps trackingNumber and carrierId', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.trackingNumber).toBe('ROUTE-001')
    expect(e.carrierId).toBe('route4me')
  })

  it('maps shipmentId to routeId', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.shipmentId).toBe('ROUTE-001')
  })

  it('maps id from route_destination_id', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.id).toBe('DEST-001')
  })

  it('maps PRE_TRANSIT when not visited/departed/accepted', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.status).toBe('PRE_TRANSIT')
  })

  it('maps DELIVERED when is_visited is true', () => {
    const [e] = transformTrackingEvents([makeDestination({ is_visited: true })], 'ROUTE-001')
    expect(e.status).toBe('DELIVERED')
  })

  it('maps OUT_FOR_DELIVERY when is_departed is true', () => {
    const [e] = transformTrackingEvents([makeDestination({ is_departed: true })], 'ROUTE-001')
    expect(e.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps IN_TRANSIT when is_accepted is true', () => {
    const [e] = transformTrackingEvents([makeDestination({ is_accepted: true })], 'ROUTE-001')
    expect(e.status).toBe('IN_TRANSIT')
  })

  it('maps first note as description', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.description).toBe('Ring doorbell')
  })

  it('maps location city and state', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.location?.city).toBe('Denver')
    expect(e.location?.state).toBe('CO')
  })

  it('maps occurredAt from timestamp_last_visited', () => {
    const ts = Math.floor(new Date('2024-03-01T00:00:00Z').getTime() / 1000)
    const [e] = transformTrackingEvents(
      [makeDestination({ timestamp_last_visited: ts })],
      'ROUTE-001',
    )
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('preserves metadata on each event', () => {
    const [e] = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    expect(e.metadata).toBeDefined()
  })

  it('passes TrackingEventSchema validation for each event', () => {
    const events = transformTrackingEvents([makeDestination()], 'ROUTE-001')
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })

  it('returns empty array when all destinations are depots', () => {
    const events = transformTrackingEvents([makeDestination({ is_depot: true })], 'ROUTE-001')
    expect(events).toHaveLength(0)
  })
})
