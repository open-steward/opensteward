import { describe, it, expect } from 'vitest'
import { transformTracking, type CircuitStop } from '../../../../../src/verticals/logistics/adapters/circuit/transform/tracking'
import { transformShipment, type CircuitStopShipment } from '../../../../../src/verticals/logistics/adapters/circuit/transform/shipment'

function makeStop(o: Partial<CircuitStop> = {}): CircuitStop {
  return { id: 'C1', state: 'enroute', packageStatus: null, externalId: 'ref-1', stopStartedAt: '2024-03-15T10:00:00Z', ...o }
}
function makeShip(o: Partial<CircuitStopShipment> = {}): CircuitStopShipment {
  return {
    id: 'C1',
    state: 'enroute',
    externalId: 'ref-1',
    address: { addressLineOne: '1 Main', city: 'NYC', state: 'NY', zip: '10001', country: 'US' },
    recipient: { name: 'Alice', phone: '+1', email: 'a@b.c' },
    notes: 'Notes',
    trackingUrl: 'https://t/1',
    stopStartedAt: '2024-03-15T10:00:00Z',
    stopFinishedAt: '2024-03-15T10:30:00Z',
    ...o,
  }
}

describe('Circuit transformTracking', () => {
  it('one event', () => expect(transformTracking(makeStop())).toHaveLength(1))
  it('unstarted PRE_TRANSIT', () => expect(transformTracking(makeStop({ state: 'unstarted' }))[0].status).toBe('PRE_TRANSIT'))
  it('enroute OUT_FOR_DELIVERY', () => expect(transformTracking(makeStop())[0].status).toBe('OUT_FOR_DELIVERY'))
  it('SUCCEEDED DELIVERED', () => expect(transformTracking(makeStop({ packageStatus: 'SUCCEEDED' }))[0].status).toBe('DELIVERED'))
  it('ATTEMPTED FAILURE', () => expect(transformTracking(makeStop({ packageStatus: 'ATTEMPTED' }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeStop({ state: null, packageStatus: null }))[0].status).toBe('UNKNOWN'))
  it('externalId', () => expect(transformTracking(makeStop())[0].trackingNumber).toBe('ref-1'))
  it('metadata', () => { const r = makeStop(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Circuit transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('C1')
    expect(s.status).toBe('OUT_FOR_DELIVERY')
    expect(s.notes).toBe('Notes')
    expect(s.trackingNumber).toBe('ref-1')
  })
  it('address', () => {
    const s = transformShipment(makeShip())
    expect(s.destinationAddress?.street1).toBe('1 Main')
    expect(s.destinationAddress?.name).toBe('Alice')
    expect(s.destinationAddress?.postalCode).toBe('10001')
  })
  it('SUCCEEDED', () => expect(transformShipment(makeShip({ packageStatus: 'SUCCEEDED' })).status).toBe('DELIVERED'))
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
