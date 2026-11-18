import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type GophrShipment,
} from '../../../../../src/verticals/logistics/adapters/gophr/transform/shipment'
import {
  transformRate,
  type GophrQuote,
} from '../../../../../src/verticals/logistics/adapters/gophr/transform/rate'

function makeShip(o: Partial<GophrShipment> = {}): GophrShipment {
  return {
    job_id: 'GP1',
    status: 'collected',
    pickup_address: { street1: '1 A', city: 'London', country: 'GB' },
    delivery_address: { street1: '2 B', city: 'London', country: 'GB' },
    external_id: 'ref-1',
    tracking_link: 'https://gophr.com/t/GP1',
    created_time: '2024-03-15T09:00:00Z',
    updated_time: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Gophr transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('GP1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.reference).toBe('ref-1')
    expect(s.labelUrl).toBe('https://gophr.com/t/GP1')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.city).toBe('London')
    expect(s.destinationAddress?.country).toBe('GB')
  })
  it('missing', () => {
    expect(transformShipment({ job_id: 'x' } as GophrShipment).originAddress).toBeUndefined()
  })
  it('metadata', () => {
    const r = makeShip()
    expect(transformShipment(r).metadata).toBe(r)
  })
})

describe('Gophr transformRate', () => {
  it('gross price', () =>
    expect(transformRate({ price_gross: 12, currency: 'GBP' } as GophrQuote).totalAmount).toBe(12))
  it('falls back to net', () =>
    expect(transformRate({ price_net: 10 } as GophrQuote).totalAmount).toBe(10))
})
