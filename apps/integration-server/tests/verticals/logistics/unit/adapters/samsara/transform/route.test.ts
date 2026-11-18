import { describe, it, expect } from 'vitest'
import {
  transformRoute,
  type SamsaraRoute,
  type SamsaraRouteStop,
  type SamsaraAddress,
} from '../../../../../../../src/verticals/logistics/adapters/samsara/transform/route'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeAddress(overrides: Partial<SamsaraAddress> = {}): SamsaraAddress {
  return {
    id: 'addr-1',
    name: 'Warehouse A',
    addressLine1: '100 Industrial Dr',
    city: 'Phoenix',
    state: 'AZ',
    postalCode: '85001',
    country: 'US',
    ...overrides,
  }
}

function makeStop(overrides: Partial<SamsaraRouteStop> = {}): SamsaraRouteStop {
  return {
    id: 'stop-1',
    name: 'Stop 1',
    state: 'unvisited',
    scheduledArrivalTime: '2024-03-01T08:00:00Z',
    scheduledDepartureTime: '2024-03-01T08:30:00Z',
    actualArrivalTime: '2024-03-01T08:05:00Z',
    actualDepartureTime: '2024-03-01T08:35:00Z',
    address: makeAddress(),
    ...overrides,
  }
}

function makeRoute(overrides: Partial<SamsaraRoute> = {}): SamsaraRoute {
  return {
    id: 'route-001',
    name: 'Morning Delivery',
    externalIds: { orderRef: 'ORD-500' },
    notes: 'Handle with care',
    state: 'en_route',
    driverIds: ['drv-1'],
    vehicleIds: ['veh-1'],
    stops: [
      makeStop({ id: 'stop-1', address: makeAddress({ city: 'Phoenix', state: 'AZ' }) }),
      makeStop({
        id: 'stop-2',
        address: makeAddress({ city: 'Tucson', state: 'AZ', addressLine1: '200 Commerce St' }),
        estimatedArrivalTime: '2024-03-01T12:00:00Z',
      }),
    ],
    scheduledStartTime: '2024-03-01T07:00:00Z',
    scheduledEndTime: '2024-03-01T13:00:00Z',
    actualStartTime: '2024-03-01T07:05:00Z',
    actualEndTime: undefined,
    createdAtTime: '2024-03-01T00:00:00Z',
    updatedAtTime: '2024-03-01T07:05:00Z',
    ...overrides,
  }
}

describe('samsara transformRoute', () => {
  it('maps id from route.id', () => {
    expect(transformRoute(makeRoute()).id).toBe('route-001')
  })

  it('sets carrierId to samsara', () => {
    expect(transformRoute(makeRoute()).carrierId).toBe('samsara')
  })

  it('maps en_route state → IN_TRANSIT', () => {
    expect(transformRoute(makeRoute({ state: 'en_route' })).status).toBe('IN_TRANSIT')
  })

  it('maps unstarted state → PENDING', () => {
    expect(transformRoute(makeRoute({ state: 'unstarted' })).status).toBe('PENDING')
  })

  it('maps completed state → DELIVERED', () => {
    expect(transformRoute(makeRoute({ state: 'completed' })).status).toBe('DELIVERED')
  })

  it('maps skipped state → EXCEPTION', () => {
    expect(transformRoute(makeRoute({ state: 'skipped' })).status).toBe('EXCEPTION')
  })

  it('maps unknown state → UNKNOWN', () => {
    expect(transformRoute(makeRoute({ state: 'weird_state' })).status).toBe('UNKNOWN')
  })

  it('uses first externalId value as trackingNumber', () => {
    expect(transformRoute(makeRoute()).trackingNumber).toBe('ORD-500')
  })

  it('leaves trackingNumber undefined when no externalIds', () => {
    expect(transformRoute(makeRoute({ externalIds: undefined })).trackingNumber).toBeUndefined()
  })

  it('maps first stop as originAddress', () => {
    const r = transformRoute(makeRoute())
    expect(r.originAddress?.city).toBe('Phoenix')
    expect(r.originAddress?.state).toBe('AZ')
  })

  it('maps last stop as destinationAddress', () => {
    const r = transformRoute(makeRoute())
    expect(r.destinationAddress?.city).toBe('Tucson')
  })

  it('maps notes', () => {
    expect(transformRoute(makeRoute()).notes).toBe('Handle with care')
  })

  it('sets mode to ftl', () => {
    expect(transformRoute(makeRoute()).mode).toBe('ftl')
  })

  it('maps createdAt from createdAtTime', () => {
    expect(transformRoute(makeRoute()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from updatedAtTime', () => {
    expect(transformRoute(makeRoute()).updatedAt).toBeInstanceOf(Date)
  })

  it('preserves raw metadata', () => {
    const raw = makeRoute()
    expect(transformRoute(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformRoute(makeRoute())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('handles empty stops array', () => {
    const r = transformRoute(makeRoute({ stops: [] }))
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })

  it('uses scheduledEndTime for estimatedDeliveryAt when last stop lacks estimatedArrivalTime', () => {
    const r = transformRoute(
      makeRoute({
        stops: [makeStop({ estimatedArrivalTime: undefined })],
        scheduledEndTime: '2024-03-01T13:00:00Z',
      }),
    )
    expect(r.estimatedDeliveryAt).toBeInstanceOf(Date)
  })
})
