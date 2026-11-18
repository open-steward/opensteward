import { describe, it, expect } from 'vitest'
import { transformTracking, type UberDirectDelivery } from '../../../../../src/verticals/logistics/adapters/uber-direct/transform/tracking'
import { transformShipment, type UberDirectShipment } from '../../../../../src/verticals/logistics/adapters/uber-direct/transform/shipment'
import { transformRate, type UberDirectQuote } from '../../../../../src/verticals/logistics/adapters/uber-direct/transform/rate'

function makeDelivery(overrides: Partial<UberDirectDelivery> = {}): UberDirectDelivery {
  return {
    id: 'del_123',
    status: 'pickup',
    pickup: { address: { street1: '1 Market St', city: 'SF', country: 'US' } },
    dropoff: { address: { street1: '2 Pine St', city: 'SF', country: 'US' } },
    tracking_url: 'https://track.uber.com/del_123',
    external_id: 'order-1',
    created: '2024-03-15T09:00:00Z',
    updated: '2024-03-15T10:00:00Z',
    ...overrides,
  }
}

function makeQuote(overrides: Partial<UberDirectQuote> = {}): UberDirectQuote {
  return {
    id: 'quo_1',
    fee: 1299,
    currency: 'USD',
    duration: 30,
    dropoff_eta: '2024-03-15T11:00:00Z',
    ...overrides,
  }
}

describe('UberDirect transformTracking', () => {
  it('returns one event', () => {
    expect(transformTracking(makeDelivery())).toHaveLength(1)
  })
  it('maps id and carrier', () => {
    const e = transformTracking(makeDelivery())[0]
    expect(e.trackingNumber).toBe('del_123')
    expect(e.carrierId).toBe('uber-direct')
  })
  it('maps status pickup to IN_TRANSIT', () => {
    expect(transformTracking(makeDelivery({ status: 'pickup' }))[0].status).toBe('IN_TRANSIT')
  })
  it('maps delivered', () => {
    expect(transformTracking(makeDelivery({ status: 'delivered' }))[0].status).toBe('DELIVERED')
  })
  it('maps dropoff to OUT_FOR_DELIVERY', () => {
    expect(transformTracking(makeDelivery({ status: 'dropoff' }))[0].status).toBe('OUT_FOR_DELIVERY')
  })
  it('maps unknown status', () => {
    expect(transformTracking(makeDelivery({ status: 'foo' }))[0].status).toBe('UNKNOWN')
  })
  it('preserves metadata', () => {
    const raw = makeDelivery()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })
  it('parses occurredAt', () => {
    expect(transformTracking(makeDelivery())[0].occurredAt).toBeInstanceOf(Date)
  })
})

describe('UberDirect transformShipment', () => {
  it('maps fields', () => {
    const s = transformShipment(makeDelivery() as UberDirectShipment)
    expect(s.id).toBe('del_123')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.carrierId).toBe('uber-direct')
    expect(s.labelUrl).toBe('https://track.uber.com/del_123')
    expect(s.reference).toBe('order-1')
  })
  it('maps addresses', () => {
    const s = transformShipment(makeDelivery() as UberDirectShipment)
    expect(s.originAddress?.city).toBe('SF')
    expect(s.destinationAddress?.street1).toBe('2 Pine St')
  })
  it('maps cancelled', () => {
    expect(transformShipment(makeDelivery({ status: 'cancelled' }) as UberDirectShipment).status).toBe('CANCELLED')
  })
  it('handles missing fields', () => {
    const s = transformShipment({ id: 'x', status: null } as UberDirectShipment)
    expect(s.originAddress).toBeUndefined()
  })
  it('preserves metadata', () => {
    const raw = makeDelivery() as UberDirectShipment
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})

describe('UberDirect transformRate', () => {
  it('converts cents to dollars', () => {
    const r = transformRate(makeQuote())
    expect(r.totalAmount).toBe(12.99)
    expect(r.currency).toBe('USD')
    expect(r.carrierId).toBe('uber-direct')
  })
  it('preserves metadata', () => {
    const raw = makeQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
