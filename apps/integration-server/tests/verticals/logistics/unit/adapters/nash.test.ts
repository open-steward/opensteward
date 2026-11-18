import { describe, it, expect } from 'vitest'
import { transformTracking, type NashJob } from '../../../../../src/verticals/logistics/adapters/nash/transform/tracking'
import { transformShipment, type NashShipment } from '../../../../../src/verticals/logistics/adapters/nash/transform/shipment'
import { transformRate, type NashQuote } from '../../../../../src/verticals/logistics/adapters/nash/transform/rate'

function makeJob(o: Partial<NashJob> = {}): NashJob {
  return { id: 'N1', status: 'pickup_complete', updated_at: '2024-03-15T10:00:00Z', ...o }
}
function makeShip(o: Partial<NashShipment> = {}): NashShipment {
  return {
    id: 'N1',
    status: 'pickup_complete',
    pickup_address: { street1: '1', city: 'NYC', country: 'US' },
    dropoff_address: { street1: '2', city: 'NYC', country: 'US' },
    external_id: 'ref-1',
    tracking_url: 'https://t/1',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Nash transformTracking', () => {
  it('one event', () => expect(transformTracking(makeJob())).toHaveLength(1))
  it('pickup_complete to IN_TRANSIT', () => expect(transformTracking(makeJob())[0].status).toBe('IN_TRANSIT'))
  it('dropoff_enroute to OFD', () => expect(transformTracking(makeJob({ status: 'dropoff_enroute' }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('delivered', () => expect(transformTracking(makeJob({ status: 'delivered' }))[0].status).toBe('DELIVERED'))
  it('cancelled', () => expect(transformTracking(makeJob({ status: 'cancelled' }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeJob({ status: 'foo' }))[0].status).toBe('UNKNOWN'))
  it('metadata', () => { const r = makeJob(); expect(transformTracking(r)[0].metadata).toBe(r) })
  it('id', () => expect(transformTracking(makeJob())[0].trackingNumber).toBe('N1'))
})

describe('Nash transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('N1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.reference).toBe('ref-1')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.city).toBe('NYC')
    expect(s.destinationAddress?.street1).toBe('2')
  })
  it('missing', () => expect(transformShipment({ id: 'x' } as NashShipment).originAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})

describe('Nash transformRate', () => {
  it('cents to dollars', () => {
    const r = transformRate({ total_price: 1599, currency: 'USD', provider_name: 'doordash' } as NashQuote)
    expect(r.totalAmount).toBe(15.99)
    expect(r.serviceCode).toBe('doordash')
  })
  it('metadata', () => { const r: NashQuote = { total_price: 1 }; expect(transformRate(r).metadata).toBe(r) })
})
