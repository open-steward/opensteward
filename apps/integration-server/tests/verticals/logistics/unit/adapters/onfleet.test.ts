import { describe, it, expect } from 'vitest'
import { transformTracking, type OnfleetTask } from '../../../../../src/verticals/logistics/adapters/onfleet/transform/tracking'
import { transformShipment, type OnfleetShipment } from '../../../../../src/verticals/logistics/adapters/onfleet/transform/shipment'

function makeTask(o: Partial<OnfleetTask> = {}): OnfleetTask {
  return { id: 'OT1', shortId: 'short-1', state: 2, timeCreated: 1710496800000, timeLastModified: 1710500400000, ...o }
}
function makeShip(o: Partial<OnfleetShipment> = {}): OnfleetShipment {
  return {
    id: 'OT1',
    shortId: 'short-1',
    state: 1,
    destination: { address: { street1: '1 A', city: 'NYC', country: 'US' } },
    recipients: [{ name: 'Alice', phone: '+15551234' }],
    trackingURL: 'https://t/1',
    notes: 'Leave at door',
    timeCreated: 1710496800000,
    timeLastModified: 1710500400000,
    ...o,
  }
}

describe('Onfleet transformTracking', () => {
  it('one event', () => expect(transformTracking(makeTask())).toHaveLength(1))
  it('state 0 PRE_TRANSIT', () => expect(transformTracking(makeTask({ state: 0 }))[0].status).toBe('PRE_TRANSIT'))
  it('state 1 IN_TRANSIT', () => expect(transformTracking(makeTask({ state: 1 }))[0].status).toBe('IN_TRANSIT'))
  it('state 2 OUT_FOR_DELIVERY', () => expect(transformTracking(makeTask({ state: 2 }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('state 3 success DELIVERED', () => expect(transformTracking(makeTask({ state: 3, completionDetails: { success: true } }))[0].status).toBe('DELIVERED'))
  it('state 3 failure FAILURE', () => expect(transformTracking(makeTask({ state: 3, completionDetails: { success: false } }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeTask({ state: null }))[0].status).toBe('UNKNOWN'))
  it('uses shortId as tracking number', () => expect(transformTracking(makeTask())[0].trackingNumber).toBe('short-1'))
  it('metadata', () => { const r = makeTask(); expect(transformTracking(r)[0].metadata).toBe(r) })
})

describe('Onfleet transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('OT1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.notes).toBe('Leave at door')
  })
  it('address', () => {
    const s = transformShipment(makeShip())
    expect(s.destinationAddress?.city).toBe('NYC')
  })
  it('missing fields', () => expect(transformShipment({ id: 'x' } as OnfleetShipment).destinationAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})
