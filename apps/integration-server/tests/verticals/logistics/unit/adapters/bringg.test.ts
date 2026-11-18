import { describe, it, expect } from 'vitest'
import { transformTracking, type BringgTask } from '../../../../../src/verticals/logistics/adapters/bringg/transform/tracking'
import { transformShipment, type BringgShipment } from '../../../../../src/verticals/logistics/adapters/bringg/transform/shipment'

function makeTask(o: Partial<BringgTask> = {}): BringgTask {
  return { id: 99, status: 2, external_id: 'ref-1', updated_at: '2024-03-15T10:00:00Z', ...o }
}
function makeShip(o: Partial<BringgShipment> = {}): BringgShipment {
  return {
    id: 99,
    status: 1,
    external_id: 'ref-1',
    title: 'Order 1',
    way_points: [
      { address: '1 A St', customer_name: 'Pickup', phone: '+1' },
      { address: '2 B St', customer_name: 'Alice', phone: '+2' },
    ],
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Bringg transformTracking', () => {
  it('one event', () => expect(transformTracking(makeTask())).toHaveLength(1))
  it('status 0 PRE_TRANSIT', () => expect(transformTracking(makeTask({ status: 0 }))[0].status).toBe('PRE_TRANSIT'))
  it('status 1 IN_TRANSIT', () => expect(transformTracking(makeTask({ status: 1 }))[0].status).toBe('IN_TRANSIT'))
  it('status 2 OUT_FOR_DELIVERY', () => expect(transformTracking(makeTask({ status: 2 }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('status 4 DELIVERED', () => expect(transformTracking(makeTask({ status: 4 }))[0].status).toBe('DELIVERED'))
  it('status 7 FAILURE', () => expect(transformTracking(makeTask({ status: 7 }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeTask({ status: 99 }))[0].status).toBe('UNKNOWN'))
  it('external id as tracking number', () => expect(transformTracking(makeTask())[0].trackingNumber).toBe('ref-1'))
  it('metadata', () => { const r = makeTask(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Bringg transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('99')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.trackingNumber).toBe('ref-1')
    expect(s.notes).toBe('Order 1')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.street1).toBe('1 A St')
    expect(s.destinationAddress?.street1).toBe('2 B St')
  })
  it('missing', () => expect(transformShipment({ id: 1 } as BringgShipment).destinationAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
