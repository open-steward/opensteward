import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type Route4MeOptimization,
  type Route4MeAddress,
} from '../../../../../../../src/verticals/logistics/adapters/route4me/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeOptimization(overrides: Partial<Route4MeOptimization> = {}): Route4MeOptimization {
  return {
    optimization_problem_id: 'OPT-001',
    state: 4, // Optimized → IN_TRANSIT
    created_timestamp: Math.floor(new Date('2024-03-01T00:00:00Z').getTime() / 1000),
    updated_timestamp: Math.floor(new Date('2024-03-01T06:00:00Z').getTime() / 1000),
    parameters: { route_name: 'Morning Run', callback_url: null },
    addresses: [
      {
        route_destination_id: 'ADDR-DEPOT',
        address: '100 Depot Rd',
        alias: 'Main Depot',
        first_name: 'Depot',
        last_name: 'Manager',
        city: 'Chicago',
        state: 'IL',
        country_id: 'US',
        zip: '60601',
        is_depot: true,
      },
      {
        route_destination_id: 'ADDR-STOP1',
        address: '200 Customer Ave',
        first_name: 'Alice',
        last_name: 'Smith',
        phone: '+15555550010',
        email: 'alice@example.com',
        city: 'Evanston',
        state: 'IL',
        country_id: 'US',
        zip: '60201',
        is_depot: false,
      },
    ],
    routes: [{ route_id: 'ROUTE-001' }],
    ...overrides,
  }
}

describe('route4me transformShipment (optimization)', () => {
  it('maps id and trackingNumber from optimization_problem_id', () => {
    const r = transformShipment(makeOptimization())
    expect(r.id).toBe('OPT-001')
    expect(r.trackingNumber).toBe('OPT-001')
  })

  it('sets carrierId to route4me', () => {
    expect(transformShipment(makeOptimization()).carrierId).toBe('route4me')
  })

  it('maps route_name to reference', () => {
    expect(transformShipment(makeOptimization()).reference).toBe('Morning Run')
  })

  it('maps depot as originAddress', () => {
    const r = transformShipment(makeOptimization())
    expect(r.originAddress?.city).toBe('Chicago')
    expect(r.originAddress?.state).toBe('IL')
  })

  it('maps first non-depot as destinationAddress', () => {
    const r = transformShipment(makeOptimization())
    expect(r.destinationAddress?.city).toBe('Evanston')
    expect(r.destinationAddress?.postalCode).toBe('60201')
  })

  it('maps createdAt from created_timestamp', () => {
    const r = transformShipment(makeOptimization())
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('preserves raw metadata', () => {
    const raw = makeOptimization()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    const result = transformShipment(makeOptimization())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps state 1 → PENDING', () => {
    expect(transformShipment(makeOptimization({ state: 1 })).status).toBe('PENDING')
  })

  it('maps state 2 → LABEL_CREATED', () => {
    expect(transformShipment(makeOptimization({ state: 2 })).status).toBe('LABEL_CREATED')
  })

  it('maps state 3 → LABEL_CREATED', () => {
    expect(transformShipment(makeOptimization({ state: 3 })).status).toBe('LABEL_CREATED')
  })

  it('maps state 4 → IN_TRANSIT', () => {
    expect(transformShipment(makeOptimization({ state: 4 })).status).toBe('IN_TRANSIT')
  })

  it('maps state 5 → EXCEPTION', () => {
    expect(transformShipment(makeOptimization({ state: 5 })).status).toBe('EXCEPTION')
  })

  it('maps unknown state → UNKNOWN', () => {
    expect(transformShipment(makeOptimization({ state: 99 })).status).toBe('UNKNOWN')
  })

  it('handles no addresses gracefully', () => {
    const r = transformShipment(makeOptimization({ addresses: [] }))
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })

  it('uses first address as destinationAddress when no depot', () => {
    const r = transformShipment(
      makeOptimization({
        addresses: [
          {
            route_destination_id: 'ADDR-1',
            address: '1 Normal St',
            city: 'Springfield',
            state: 'IL',
            is_depot: false,
          },
        ],
      }),
    )
    expect(r.destinationAddress?.city).toBe('Springfield')
    expect(r.originAddress).toBeUndefined()
  })
})
