import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type PandagoOrder,
} from '../../../../../../../src/verticals/logistics/adapters/pandago/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<PandagoOrder> = {}): PandagoOrder {
  return {
    order_id: 'pg-shp-001',
    client_order_id: 'CLT-SHP-001',
    status: 'IN_TRANSIT',
    delivery_fee: 6.0,
    currency_code: 'SGD',
    description: 'Electronics',
    payment_method: 'CARD',
    tracking_link: 'https://pandago.example/track/pg-shp-001',
    sender: {
      name: 'Warehouse',
      phone_number: '+6500001234',
      location: {
        address: '10 Jurong East Ave, Singapore',
        latitude: 1.3329,
        longitude: 103.7436,
      },
    },
    recipient: {
      name: 'Customer A',
      phone_number: '+6500005678',
      location: {
        address: '5 Tampines Rd, Singapore',
        latitude: 1.3521,
        longitude: 103.9198,
      },
    },
    created_at: 1709251200, // 2024-03-01T00:00:00Z
    updated_at: 1709258400, // 2024-03-01T02:00:00Z
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pandago transformShipment', () => {
  it('maps id from order_id', () => {
    expect(transformShipment(makeOrder()).id).toBe('pg-shp-001')
  })

  it('sets carrierId to "pandago"', () => {
    expect(transformShipment(makeOrder()).carrierId).toBe('pandago')
  })

  it('uses order_id as trackingNumber', () => {
    expect(transformShipment(makeOrder()).trackingNumber).toBe('pg-shp-001')
  })

  it('maps reference from client_order_id', () => {
    expect(transformShipment(makeOrder()).reference).toBe('CLT-SHP-001')
  })

  it('maps PICKED_UP to IN_TRANSIT', () => {
    expect(transformShipment(makeOrder({ status: 'PICKED_UP' })).status).toBe('IN_TRANSIT')
  })

  it('maps NEAR_CUSTOMER to OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeOrder({ status: 'NEAR_CUSTOMER' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps DELIVERED to DELIVERED', () => {
    expect(transformShipment(makeOrder({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps CANCELLED to CANCELLED', () => {
    expect(transformShipment(makeOrder({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps RETURNED_TO_VENDOR to RETURNED', () => {
    expect(transformShipment(makeOrder({ status: 'RETURNED_TO_VENDOR' })).status).toBe('RETURNED')
  })

  it('maps NEW to PENDING', () => {
    expect(transformShipment(makeOrder({ status: 'NEW' })).status).toBe('PENDING')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeOrder({ status: 'BOGUS' })).status).toBe('UNKNOWN')
  })

  it('maps origin address from sender.location', () => {
    const r = transformShipment(makeOrder())
    expect(r.originAddress?.name).toBe('Warehouse')
    expect(r.originAddress?.street1).toBe('10 Jurong East Ave, Singapore')
  })

  it('maps destination address from recipient.location', () => {
    const r = transformShipment(makeOrder())
    expect(r.destinationAddress?.name).toBe('Customer A')
    expect(r.destinationAddress?.street1).toBe('5 Tampines Rd, Singapore')
  })

  it('maps cost.amount from delivery_fee', () => {
    const r = transformShipment(makeOrder())
    expect(r.cost?.amount).toBe(6.0)
    expect(r.cost?.currency).toBe('SGD')
  })

  it('maps labelUrl from tracking_link', () => {
    // ShipmentSchema labelUrl is z.url() — tracking_link must be a valid URL
    expect(transformShipment(makeOrder()).labelUrl).toBe('https://pandago.example/track/pg-shp-001')
  })

  it('converts unix epoch seconds to Date for createdAt', () => {
    const r = transformShipment(makeOrder())
    expect(r.createdAt).toBeInstanceOf(Date)
    expect(r.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('converts unix epoch seconds to Date for updatedAt', () => {
    const r = transformShipment(makeOrder())
    expect(r.updatedAt).toBeInstanceOf(Date)
    expect(r.updatedAt?.toISOString()).toBe('2024-03-01T02:00:00.000Z')
  })

  it('omits cost when delivery_fee is null', () => {
    expect(transformShipment(makeOrder({ delivery_fee: null })).cost).toBeUndefined()
  })

  it('omits originAddress when sender is null', () => {
    expect(transformShipment(makeOrder({ sender: null })).originAddress).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeOrder()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('passes ShipmentSchema validation', () => {
    // pandago does not emit a country code — AddressSchema.country is Iso3166Alpha2
    // street1 is present but country is absent, which is fine (all optional)
    expect(() => ShipmentSchema.parse(transformShipment(makeOrder()))).not.toThrow()
  })
})
