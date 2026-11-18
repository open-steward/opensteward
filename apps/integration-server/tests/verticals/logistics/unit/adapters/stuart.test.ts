import { describe, it, expect } from 'vitest'
import { transformTracking, type StuartJob } from '../../../../../src/verticals/logistics/adapters/stuart/transform/tracking'
import { transformShipment, type StuartShipment } from '../../../../../src/verticals/logistics/adapters/stuart/transform/shipment'
import { transformRate, type StuartPricing } from '../../../../../src/verticals/logistics/adapters/stuart/transform/rate'

function makeJob(o: Partial<StuartJob> = {}): StuartJob {
  return {
    id: 12345,
    status: 'in_progress',
    tracking_url: 'https://stuart.com/t/12345',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

function makeShipment(o: Partial<StuartShipment> = {}): StuartShipment {
  return {
    id: 12345,
    status: 'delivering',
    pickups: [{ address: { street1: '1 Rue de Paris', city: 'Paris', country: 'FR' } }],
    deliveries: [{ address: { street1: '2 Rue de Lyon', city: 'Lyon', country: 'FR' }, tracking_url: 'https://t/1', client_reference: 'ref-1' }],
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Stuart transformTracking', () => {
  it('returns single event', () => expect(transformTracking(makeJob())).toHaveLength(1))
  it('maps in_progress', () => expect(transformTracking(makeJob())[0].status).toBe('IN_TRANSIT'))
  it('maps delivered', () => expect(transformTracking(makeJob({ status: 'delivered' }))[0].status).toBe('DELIVERED'))
  it('maps delivering to OUT_FOR_DELIVERY', () => expect(transformTracking(makeJob({ status: 'delivering' }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('maps cancelled to FAILURE', () => expect(transformTracking(makeJob({ status: 'cancelled' }))[0].status).toBe('FAILURE'))
  it('maps unknown', () => expect(transformTracking(makeJob({ status: 'foo' }))[0].status).toBe('UNKNOWN'))
  it('preserves metadata', () => { const r = makeJob(); expect(transformTracking(r)[0].metadata).toBe(r) })
  it('uses id as tracking number', () => expect(transformTracking(makeJob())[0].trackingNumber).toBe('12345'))
})

describe('Stuart transformShipment', () => {
  it('maps fields', () => {
    const s = transformShipment(makeShipment())
    expect(s.id).toBe('12345')
    expect(s.status).toBe('OUT_FOR_DELIVERY')
    expect(s.reference).toBe('ref-1')
  })
  it('maps addresses', () => {
    const s = transformShipment(makeShipment())
    expect(s.originAddress?.city).toBe('Paris')
    expect(s.destinationAddress?.city).toBe('Lyon')
  })
  it('handles missing fields', () => {
    const s = transformShipment({ id: 1, status: null } as StuartShipment)
    expect(s.originAddress).toBeUndefined()
  })
  it('preserves metadata', () => { const r = makeShipment(); expect(transformShipment(r).metadata).toBe(r) })
})

describe('Stuart transformRate', () => {
  it('maps amount', () => {
    const r = transformRate({ amount: 15.5, currency: 'EUR' } as StuartPricing)
    expect(r.totalAmount).toBe(15.5)
    expect(r.currency).toBe('EUR')
  })
  it('preserves metadata', () => { const r: StuartPricing = { amount: 1 }; expect(transformRate(r).metadata).toBe(r) })
})
