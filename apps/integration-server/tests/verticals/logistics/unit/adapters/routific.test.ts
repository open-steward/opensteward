import { describe, it, expect } from 'vitest'
import { transformTracking, type RoutificVisit } from '../../../../../src/verticals/logistics/adapters/routific/transform/tracking'
import { transformShipment, type RoutificVisitShipment } from '../../../../../src/verticals/logistics/adapters/routific/transform/shipment'

function makeVisit(o: Partial<RoutificVisit> = {}): RoutificVisit {
  return { id: 'V1', status: 'in_progress', arrival_time: '2024-03-15T10:00:00Z', finish_time: '2024-03-15T10:15:00Z', ...o }
}
function makeShip(o: Partial<RoutificVisitShipment> = {}): RoutificVisitShipment {
  return {
    id: 'V1',
    status: 'in_progress',
    location: { address: '1 Main St', name: 'Alice' },
    custom_notes: 'Notes',
    arrival_time: '2024-03-15T10:00:00Z',
    finish_time: '2024-03-15T10:15:00Z',
    ...o,
  }
}

describe('Routific transformTracking', () => {
  it('one event', () => expect(transformTracking(makeVisit())).toHaveLength(1))
  it('planned to PRE_TRANSIT', () => expect(transformTracking(makeVisit({ status: 'planned' }))[0].status).toBe('PRE_TRANSIT'))
  it('in_progress IN_TRANSIT', () => expect(transformTracking(makeVisit())[0].status).toBe('IN_TRANSIT'))
  it('arrived OUT_FOR_DELIVERY', () => expect(transformTracking(makeVisit({ status: 'arrived' }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('completed DELIVERED', () => expect(transformTracking(makeVisit({ status: 'completed' }))[0].status).toBe('DELIVERED'))
  it('failed FAILURE', () => expect(transformTracking(makeVisit({ status: 'failed' }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeVisit({ status: 'foo' }))[0].status).toBe('UNKNOWN'))
  it('metadata', () => { const r = makeVisit(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Routific transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('V1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.notes).toBe('Notes')
  })
  it('address', () => expect(transformShipment(makeShip()).destinationAddress?.street1).toBe('1 Main St'))
  it('missing', () => expect(transformShipment({ id: 'x' } as RoutificVisitShipment).destinationAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
