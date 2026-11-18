import { describe, it, expect } from 'vitest'
import { transformTracking, type OptimorouteOrder } from '../../../../../src/verticals/logistics/adapters/optimoroute/transform/tracking'
import { transformShipment, type OptimorouteShipment } from '../../../../../src/verticals/logistics/adapters/optimoroute/transform/shipment'

function makeOrder(o: Partial<OptimorouteOrder> = {}): OptimorouteOrder {
  return { orderNo: 'O1', status: 'on_route', date: '2024-03-15', startTime: '2024-03-15T09:00:00Z', endTime: '2024-03-15T10:00:00Z', ...o }
}
function makeShip(o: Partial<OptimorouteShipment> = {}): OptimorouteShipment {
  return {
    orderNo: 'O1',
    status: 'on_route',
    location: { address: '1 Main', locationName: 'Alice' },
    notes: 'Notes',
    date: '2024-03-15',
    startTime: '2024-03-15T09:00:00Z',
    endTime: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Optimoroute transformTracking', () => {
  it('one event', () => expect(transformTracking(makeOrder())).toHaveLength(1))
  it('scheduled PRE_TRANSIT', () => expect(transformTracking(makeOrder({ status: 'scheduled' }))[0].status).toBe('PRE_TRANSIT'))
  it('on_route IN_TRANSIT', () => expect(transformTracking(makeOrder())[0].status).toBe('IN_TRANSIT'))
  it('servicing OUT_FOR_DELIVERY', () => expect(transformTracking(makeOrder({ status: 'servicing' }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('success DELIVERED', () => expect(transformTracking(makeOrder({ status: 'success' }))[0].status).toBe('DELIVERED'))
  it('failed FAILURE', () => expect(transformTracking(makeOrder({ status: 'failed' }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeOrder({ status: 'foo' }))[0].status).toBe('UNKNOWN'))
  it('orderNo as tracking', () => expect(transformTracking(makeOrder())[0].trackingNumber).toBe('O1'))
  it('metadata', () => { const r = makeOrder(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Optimoroute transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('O1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.notes).toBe('Notes')
  })
  it('address', () => {
    const s = transformShipment(makeShip())
    expect(s.destinationAddress?.street1).toBe('1 Main')
    expect(s.destinationAddress?.name).toBe('Alice')
  })
  it('missing', () => expect(transformShipment({ orderNo: 'x' } as OptimorouteShipment).destinationAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
