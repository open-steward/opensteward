import { describe, it, expect } from 'vitest'
import { transformTracking, type VehoPackage } from '../../../../../src/verticals/logistics/adapters/veho/transform/tracking'
import { transformShipment, type VehoShipment } from '../../../../../src/verticals/logistics/adapters/veho/transform/shipment'
import { transformRate, type VehoRate } from '../../../../../src/verticals/logistics/adapters/veho/transform/rate'

function makePkg(o: Partial<VehoPackage> = {}): VehoPackage {
  return {
    package_id: 'V1',
    status: 'in_transit',
    tracking_number: 'VHO-1',
    events: [
      { status: 'in_transit', description: 'In transit', occurred_at: '2024-03-15T10:00:00Z', location: { city: 'Boston', state: 'MA', postal_code: '02108' } },
    ],
    ...o,
  }
}
function makeShip(o: Partial<VehoShipment> = {}): VehoShipment {
  return {
    package_id: 'V1',
    status: 'in_transit',
    tracking_number: 'VHO-1',
    origin_address: { street1: '1 A', city: 'Boston', country: 'US' },
    destination_address: { street1: '2 B', city: 'Cambridge', country: 'US' },
    weight_oz: 16,
    reference: 'ref-1',
    label_url: 'https://l/1',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('Veho transformTracking', () => {
  it('one event', () => expect(transformTracking(makePkg())).toHaveLength(1))
  it('in_transit', () => expect(transformTracking(makePkg())[0].status).toBe('IN_TRANSIT'))
  it('out_for_delivery', () => expect(transformTracking({ ...makePkg(), events: [{ status: 'out_for_delivery' }] })[0].status).toBe('OUT_FOR_DELIVERY'))
  it('delivered', () => expect(transformTracking({ ...makePkg(), events: [{ status: 'delivered' }] })[0].status).toBe('DELIVERED'))
  it('failed', () => expect(transformTracking({ ...makePkg(), events: [{ status: 'failed' }] })[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking({ ...makePkg(), events: [{ status: 'foo' }] })[0].status).toBe('UNKNOWN'))
  it('empty events fallback', () => expect(transformTracking({ package_id: 'x', status: 'created', events: [] } as VehoPackage)).toHaveLength(1))
  it('location', () => expect(transformTracking(makePkg())[0].location?.city).toBe('Boston'))
  it('metadata', () => expect(transformTracking(makePkg())[0].metadata).toBeDefined())
})

describe('Veho transformShipment', () => {
  it('fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('V1')
    expect(s.status).toBe('IN_TRANSIT')
    expect(s.trackingNumber).toBe('VHO-1')
    expect(s.totalWeight?.value).toBe(16)
    expect(s.totalWeight?.unit).toBe('oz')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.city).toBe('Boston')
    expect(s.destinationAddress?.city).toBe('Cambridge')
  })
  it('missing', () => expect(transformShipment({ package_id: 'x' } as VehoShipment).originAddress).toBeUndefined())
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})

describe('Veho transformRate', () => {
  it('maps', () => {
    const r = transformRate({ total_amount: 9.99, currency: 'USD', service_code: 'standard' } as VehoRate)
    expect(r.totalAmount).toBe(9.99)
    expect(r.serviceCode).toBe('standard')
  })
  it('metadata', () => { const r: VehoRate = { total_amount: 1 }; expect(transformRate(r).metadata).toBe(r) })
})
