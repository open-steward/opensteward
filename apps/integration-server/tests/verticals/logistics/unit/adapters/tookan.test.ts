import { describe, it, expect } from 'vitest'
import { transformTracking, type TookanTask } from '../../../../../src/verticals/logistics/adapters/tookan/transform/tracking'
import { transformShipment, type TookanShipment } from '../../../../../src/verticals/logistics/adapters/tookan/transform/shipment'

function makeTask(o: Partial<TookanTask> = {}): TookanTask {
  return { job_id: 555, job_status: 1, order_id: 'ORD-1', completed_datetime: '2024-03-15T10:00:00Z', ...o }
}
function makeShip(o: Partial<TookanShipment> = {}): TookanShipment {
  return {
    job_id: 555,
    job_status: 1,
    order_id: 'ORD-1',
    job_pickup_address: '1 A St',
    job_address: '2 B St',
    customer_username: 'Alice',
    customer_phone: '+1',
    job_description: 'Notes',
    job_pickup_datetime: '2024-03-15T09:00:00Z',
    job_delivery_datetime: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Tookan transformTracking', () => {
  it('one event', () => expect(transformTracking(makeTask())).toHaveLength(1))
  it('status 0 PRE_TRANSIT', () => expect(transformTracking(makeTask({ job_status: 0 }))[0].status).toBe('PRE_TRANSIT'))
  it('status 1 IN_TRANSIT', () => expect(transformTracking(makeTask({ job_status: 1 }))[0].status).toBe('IN_TRANSIT'))
  it('status 8 OUT_FOR_DELIVERY', () => expect(transformTracking(makeTask({ job_status: 8 }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('status 2 DELIVERED', () => expect(transformTracking(makeTask({ job_status: 2 }))[0].status).toBe('DELIVERED'))
  it('status 3 FAILURE', () => expect(transformTracking(makeTask({ job_status: 3 }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeTask({ job_status: 99 }))[0].status).toBe('UNKNOWN'))
  it('order_id used', () => expect(transformTracking(makeTask())[0].trackingNumber).toBe('ORD-1'))
  it('metadata', () => { const r = makeTask(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Tookan transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('555')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.notes).toBe('Notes')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.street1).toBe('1 A St')
    expect(s.destinationAddress?.name).toBe('Alice')
  })
  it('missing', () => expect(transformShipment({ job_id: 1 } as TookanShipment).destinationAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
