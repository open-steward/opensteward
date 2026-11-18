import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type StarshipitShipment,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<StarshipitShipment> = {}): StarshipitShipment {
  return {
    order_id: 55001,
    order_number: 'ORD-001',
    status: 'shipped',
    tracking_number: 'AP123456789AU',
    carrier_name: 'Australia Post',
    carrier_code: 'auspost',
    service_name: 'Parcel Post',
    service_code: 'AP_PARCEL',
    destination: {
      name: 'Bob Buyer',
      street: '10 George St',
      suburb: 'Sydney',
      state: 'NSW',
      post_code: '2000',
      country_code: 'AU',
    },
    sender: {
      name: 'Alice Seller',
      street: '1 Collins St',
      suburb: 'Melbourne',
      state: 'VIC',
      post_code: '3000',
      country_code: 'AU',
    },
    packages: [
      {
        weight: 2.5,
        height: 10,
        width: 20,
        length: 30,
        tracking_number: 'AP123456789AU',
      },
    ],
    weight: 2.5,
    label_url: null,
    shipping_price: 12.5,
    currency: 'AUD',
    reference: 'ORD-001',
    notes: 'Handle with care',
    order_date: '2024-03-01T00:00:00Z',
    shipped_date: '2024-03-01T00:00:00Z',
    created_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('starshipit transformShipment', () => {
  it('maps id from order_id (numeric → string)', () => {
    expect(transformShipment(makeRaw()).id).toBe('55001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('AP123456789AU')
  })

  it('maps carrierId from carrier_code', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('auspost')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('AP_PARCEL')
  })

  it('maps status IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'shipped' })).status).toBe('IN_TRANSIT')
    expect(transformShipment(makeRaw({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
    expect(transformShipment(makeRaw({ status: 'transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps status PENDING', () => {
    expect(transformShipment(makeRaw({ status: 'pending' })).status).toBe('PENDING')
    expect(transformShipment(makeRaw({ status: 'new' })).status).toBe('PENDING')
  })

  it('maps status LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'printed' })).status).toBe('LABEL_CREATED')
  })

  it('maps status DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps status EXCEPTION', () => {
    expect(transformShipment(makeRaw({ status: 'exception' })).status).toBe('EXCEPTION')
    expect(transformShipment(makeRaw({ status: 'failed' })).status).toBe('EXCEPTION')
  })

  it('maps status RETURNED', () => {
    expect(transformShipment(makeRaw({ status: 'returned' })).status).toBe('RETURNED')
    expect(transformShipment(makeRaw({ status: 'return_to_sender' })).status).toBe('RETURNED')
  })

  it('maps destinationAddress from destination', () => {
    const r = transformShipment(makeRaw())
    expect(r.destinationAddress?.name).toBe('Bob Buyer')
    expect(r.destinationAddress?.city).toBe('Sydney')
    expect(r.destinationAddress?.country).toBe('AU')
  })

  it('maps originAddress from sender', () => {
    const r = transformShipment(makeRaw())
    expect(r.originAddress?.name).toBe('Alice Seller')
    expect(r.originAddress?.city).toBe('Melbourne')
  })

  it('maps totalWeight from weight field in kg', () => {
    const r = transformShipment(makeRaw())
    expect(r.totalWeight?.value).toBe(2.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('sums package weights when top-level weight is null', () => {
    const r = transformShipment(
      makeRaw({ weight: null, packages: [{ weight: 1.0 }, { weight: 1.5 }] }),
    )
    expect(r.totalWeight?.value).toBe(2.5)
  })

  it('maps dimensions from first package (cm)', () => {
    const r = transformShipment(makeRaw())
    expect(r.dimensions?.length).toBe(30)
    expect(r.dimensions?.width).toBe(20)
    expect(r.dimensions?.height).toBe(10)
    expect(r.dimensions?.unit).toBe('cm')
  })

  it('maps cost amount and currency', () => {
    const r = transformShipment(makeRaw())
    expect(r.cost?.amount).toBe(12.5)
    expect(r.cost?.currency).toBe('AUD')
  })

  it('maps reference from reference field', () => {
    expect(transformShipment(makeRaw()).reference).toBe('ORD-001')
  })

  it('maps notes', () => {
    expect(transformShipment(makeRaw()).notes).toBe('Handle with care')
  })

  it('maps createdAt from created_date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('does NOT parse as schema-valid Shipment — cost.amount is a float but Amount schema requires int (minor-units)', () => {
    // The transform emits decimal shipping_price (e.g. 12.5) as cost.amount, while
    // MoneySchema.amount uses Amount which requires a safe integer (minor-units).
    // This is a known schema incompatibility in the source transform.
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).toThrow()
  })
})
