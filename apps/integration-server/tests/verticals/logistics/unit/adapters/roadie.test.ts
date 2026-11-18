import { describe, it, expect } from 'vitest'
import { transformTracking, type RoadieShipmentResp } from '../../../../../src/verticals/logistics/adapters/roadie/transform/tracking'
import { transformShipment, type RoadieShipment } from '../../../../../src/verticals/logistics/adapters/roadie/transform/shipment'
import { transformRate, type RoadieEstimate } from '../../../../../src/verticals/logistics/adapters/roadie/transform/rate'

function makeResp(o: Partial<RoadieShipmentResp> = {}): RoadieShipmentResp {
  return {
    id: 100,
    state: 'picked_up',
    tracking_number: 'RD-100',
    events: [
      { name: 'picked_up', occurred_at: '2024-03-15T10:00:00Z', location: { city: 'Atlanta', state: 'GA', zip: '30301' } },
      { name: 'delivered', occurred_at: '2024-03-15T12:00:00Z', location: null },
    ],
    ...o,
  }
}
function makeShip(o: Partial<RoadieShipment> = {}): RoadieShipment {
  return {
    id: 100,
    state: 'picked_up',
    tracking_number: 'RD-100',
    pickup_location: { address: { street1: '1 A', city: 'Atlanta', country: 'US' } },
    delivery_location: { address: { street1: '2 B', city: 'Marietta', country: 'US' } },
    reference_id: 'ref-1',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Roadie transformTracking', () => {
  it('events count', () => expect(transformTracking(makeResp())).toHaveLength(2))
  it('first event status', () => expect(transformTracking(makeResp())[0].status).toBe('IN_TRANSIT'))
  it('delivered status', () => expect(transformTracking(makeResp())[1].status).toBe('DELIVERED'))
  it('location', () => expect(transformTracking(makeResp())[0].location?.city).toBe('Atlanta'))
  it('null location ok', () => expect(transformTracking(makeResp())[1].location).toBeUndefined())
  it('empty events fallback', () => {
    const e = transformTracking({ id: 1, state: 'new', events: [] } as RoadieShipmentResp)
    expect(e).toHaveLength(1)
    expect(e[0].status).toBe('PRE_TRANSIT')
  })
  it('metadata', () => { const r = makeResp(); expect(transformTracking(r)[0].metadata).toBeDefined() })
  it('unknown', () => expect(transformTracking({ id: 1, state: 'foo', events: [] } as RoadieShipmentResp)[0].status).toBe('UNKNOWN'))
})

describe('Roadie transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('100')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.reference).toBe('ref-1')
    expect(s.trackingNumber).toBe('RD-100')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.city).toBe('Atlanta')
    expect(s.destinationAddress?.city).toBe('Marietta')
  })
  it('missing', () => {
    const s = transformShipment({ id: 1, state: null } as RoadieShipment)
    expect(s.originAddress).toBeUndefined()
  })
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})

describe('Roadie transformRate', () => {
  it('maps price', () => {
    const r = transformRate({ price: 25.5, currency: 'USD' } as RoadieEstimate)
    expect(r.totalAmount).toBe(25.5)
  })
  it('metadata', () => { const r: RoadieEstimate = { price: 1 }; expect(transformRate(r).metadata).toBe(r) })
})
