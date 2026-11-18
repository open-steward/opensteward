import { describe, it, expect } from 'vitest'
import { transformRouteTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/samsara/transform/tracking'
import type {
  SamsaraRoute,
  SamsaraRouteStop,
  SamsaraAddress,
} from '../../../../../../../src/verticals/logistics/adapters/samsara/transform/route'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeAddress(overrides: Partial<SamsaraAddress> = {}): SamsaraAddress {
  return {
    id: 'addr-1',
    name: 'Stop Location',
    addressLine1: '10 Main St',
    city: 'Dallas',
    state: 'TX',
    postalCode: '75201',
    country: 'US',
    ...overrides,
  }
}

function makeStop(overrides: Partial<SamsaraRouteStop> = {}): SamsaraRouteStop {
  return {
    id: 'stop-1',
    name: 'Customer Stop',
    state: 'arrived',
    scheduledArrivalTime: '2024-03-01T09:00:00Z',
    actualArrivalTime: '2024-03-01T09:10:00Z',
    actualDepartureTime: '2024-03-01T09:30:00Z',
    address: makeAddress(),
    ...overrides,
  }
}

function makeRoute(overrides: Partial<SamsaraRoute> = {}): SamsaraRoute {
  return {
    id: 'route-123',
    name: 'Afternoon Route',
    externalIds: { ref: 'EXT-777' },
    state: 'en_route',
    stops: [
      makeStop(),
      makeStop({
        id: 'stop-2',
        state: 'unvisited',
        actualArrivalTime: undefined,
        actualDepartureTime: undefined,
      }),
    ],
    scheduledStartTime: '2024-03-01T08:00:00Z',
    createdAtTime: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('samsara transformRouteTrackingEvents', () => {
  it('produces one event per stop', () => {
    const events = transformRouteTrackingEvents(makeRoute())
    expect(events).toHaveLength(2)
  })

  it('uses first externalId as trackingNumber', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.trackingNumber).toBe('EXT-777')
  })

  it('falls back to route.id as trackingNumber when no externalIds', () => {
    const [e] = transformRouteTrackingEvents(makeRoute({ externalIds: undefined }))
    expect(e.trackingNumber).toBe('route-123')
  })

  it('sets carrierId to samsara', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.carrierId).toBe('samsara')
  })

  it('maps shipmentId from route.id', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.shipmentId).toBe('route-123')
  })

  it('maps arrived stop state → IN_TRANSIT via STOP_STATE_MAP', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.status).toBe('IN_TRANSIT')
  })

  it('maps unvisited stop state → PRE_TRANSIT', () => {
    const [, e2] = transformRouteTrackingEvents(makeRoute())
    expect(e2.status).toBe('PRE_TRANSIT')
  })

  it('maps departed stop state → DELIVERED', () => {
    const events = transformRouteTrackingEvents(
      makeRoute({ stops: [makeStop({ state: 'departed' })] }),
    )
    expect(events[0].status).toBe('DELIVERED')
  })

  it('maps skipped stop state → FAILURE', () => {
    const events = transformRouteTrackingEvents(
      makeRoute({ stops: [makeStop({ state: 'skipped' })] }),
    )
    expect(events[0].status).toBe('FAILURE')
  })

  it('maps location from stop.address', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.location?.city).toBe('Dallas')
    expect(e.location?.state).toBe('TX')
  })

  it('prefers actualDepartureTime for occurredAt', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('includes stop name in description', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect(e.description).toContain('Customer Stop')
  })

  it('preserves metadata with route and stop', () => {
    const [e] = transformRouteTrackingEvents(makeRoute())
    expect((e.metadata as Record<string, unknown>)?.route).toBeDefined()
    expect((e.metadata as Record<string, unknown>)?.stop).toBeDefined()
  })

  it('emits single route-level event when no stops', () => {
    const events = transformRouteTrackingEvents(makeRoute({ stops: [] }))
    expect(events).toHaveLength(1)
  })

  it('fallback event uses en_route → IN_TRANSIT', () => {
    const events = transformRouteTrackingEvents(makeRoute({ stops: [], state: 'en_route' }))
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('fallback event uses completed → DELIVERED', () => {
    const events = transformRouteTrackingEvents(makeRoute({ stops: [], state: 'completed' }))
    expect(events[0].status).toBe('DELIVERED')
  })

  it('passes TrackingEventSchema validation for each event', () => {
    const events = transformRouteTrackingEvents(makeRoute())
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
