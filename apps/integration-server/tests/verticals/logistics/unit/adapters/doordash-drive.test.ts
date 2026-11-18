import { describe, it, expect } from 'vitest'
import { exchangeCode } from '../../../../../src/verticals/logistics/adapters/doordash-drive/auth'
import { transformTracking, type DoordashDelivery } from '../../../../../src/verticals/logistics/adapters/doordash-drive/transform/tracking'
import { transformShipment, type DoordashShipment } from '../../../../../src/verticals/logistics/adapters/doordash-drive/transform/shipment'
import { transformRate, type DoordashQuote } from '../../../../../src/verticals/logistics/adapters/doordash-drive/transform/rate'

function makeDel(o: Partial<DoordashDelivery> = {}): DoordashDelivery {
  return {
    external_delivery_id: 'D-1',
    delivery_status: 'picked_up',
    tracking_url: 'https://t/1',
    updated_at: '2024-03-15T10:00:00Z',
    created_at: '2024-03-15T09:00:00Z',
    ...o,
  }
}
function makeShip(o: Partial<DoordashShipment> = {}): DoordashShipment {
  return {
    external_delivery_id: 'D-1',
    delivery_status: 'enroute_to_dropoff',
    pickup_address: { street1: '1 A', city: 'NYC', country: 'US' },
    dropoff_address: { street1: '2 B', city: 'NYC', country: 'US' },
    tracking_url: 'https://t/1',
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:00:00Z',
    ...o,
  }
}

describe('DoordashDrive transformTracking', () => {
  it('one event', () => expect(transformTracking(makeDel())).toHaveLength(1))
  it('picked_up to IN_TRANSIT', () => expect(transformTracking(makeDel())[0].status).toBe('IN_TRANSIT'))
  it('delivered', () => expect(transformTracking(makeDel({ delivery_status: 'delivered' }))[0].status).toBe('DELIVERED'))
  it('enroute_to_dropoff', () => expect(transformTracking(makeDel({ delivery_status: 'enroute_to_dropoff' }))[0].status).toBe('OUT_FOR_DELIVERY'))
  it('cancelled', () => expect(transformTracking(makeDel({ delivery_status: 'cancelled' }))[0].status).toBe('FAILURE'))
  it('unknown', () => expect(transformTracking(makeDel({ delivery_status: 'foo' }))[0].status).toBe('UNKNOWN'))
  it('metadata', () => { const r = makeDel(); expect(transformTracking(r)[0].metadata).toBe(r) })
  it('tracking number', () => expect(transformTracking(makeDel())[0].trackingNumber).toBe('D-1'))
})

describe('DoordashDrive transformShipment', () => {
  it('maps fields', () => {
    const s = transformShipment(makeShip())
    expect(s.id).toBe('D-1')
    expect(s.status).toBe('OUT_FOR_DELIVERY')
    expect(s.carrierId).toBe('doordash-drive')
  })
  it('addresses', () => {
    const s = transformShipment(makeShip())
    expect(s.originAddress?.city).toBe('NYC')
    expect(s.destinationAddress?.street1).toBe('2 B')
  })
  it('missing fields', () => {
    expect(transformShipment({ external_delivery_id: 'x' } as DoordashShipment).originAddress).toBeUndefined()
  })
  it('metadata', () => { const r = makeShip(); expect(transformShipment(r).metadata).toBe(r) })
})

describe('DoordashDrive exchangeCode', () => {
  it('parses developer_id:key_id:signing_secret', async () => {
    const c = await exchangeCode('dev-uuid:key-uuid:c2VjcmV0', '')
    expect(c.extra?.developerId).toBe('dev-uuid')
    expect(c.extra?.keyId).toBe('key-uuid')
    expect(c.extra?.signingSecret).toBe('c2VjcmV0')
    expect(c.accessToken).toBe('')
  })
  it('throws when parts missing', async () => {
    await expect(exchangeCode('only-one', '')).rejects.toThrow(/developer_id/)
  })
  it('throws when a part is empty', async () => {
    await expect(exchangeCode('a::c', '')).rejects.toThrow(/developer_id/)
  })
})

describe('DoordashDrive transformRate', () => {
  it('cents to dollars', () => {
    const r = transformRate({ fee: 999, currency: 'USD' } as DoordashQuote)
    expect(r.totalAmount).toBe(9.99)
  })
  it('metadata', () => { const r: DoordashQuote = { fee: 1 }; expect(transformRate(r).metadata).toBe(r) })
})
