import { describe, it, expect } from 'vitest'
import {
  transformJeeblyShipment,
  type JeeblyShipment,
  type JeeblyAddress,
} from '../../../../../../../src/verticals/logistics/adapters/jeebly/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeAddress(overrides: Partial<JeeblyAddress> = {}): JeeblyAddress {
  return {
    name: 'Alice',
    address_line1: '123 Main St',
    city: 'Dubai',
    country: 'AE',
    phone: '+971501234567',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<JeeblyShipment> = {}): JeeblyShipment {
  return {
    id: 'SHP-001',
    awb: 'AWB001',
    reference: 'REF-001',
    status: 'in_transit',
    service_type: 'STANDARD',
    shipper: makeAddress({ name: 'Sender Corp' }),
    consignee: makeAddress({ name: 'Bob', city: 'Abu Dhabi' }),
    weight: 2.0,
    weight_unit: 'kg',
    cod_amount: 100,
    currency: 'AED',
    notes: 'Fragile',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('jeebly transformJeeblyShipment', () => {
  it('maps id directly', () => {
    expect(transformJeeblyShipment(makeRaw()).id).toBe('SHP-001')
  })

  it('maps awb to trackingNumber', () => {
    expect(transformJeeblyShipment(makeRaw()).trackingNumber).toBe('AWB001')
  })

  it('maps in_transit status to IN_TRANSIT', () => {
    expect(transformJeeblyShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps delivered status to DELIVERED', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps out_for_delivery status to OUT_FOR_DELIVERY', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps label/created/pending status to LABEL_CREATED', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'created' })).status).toBe('LABEL_CREATED')
    expect(transformJeeblyShipment(makeRaw({ status: 'pending' })).status).toBe('LABEL_CREATED')
  })

  it('maps returned status to RETURNED', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'returned' })).status).toBe('RETURNED')
  })

  it('maps cancelled status to CANCELLED', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps exception status to EXCEPTION', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformJeeblyShipment(makeRaw({ status: 'bogus_xyz' })).status).toBe('UNKNOWN')
  })

  it('maps shipper to originAddress', () => {
    const r = transformJeeblyShipment(makeRaw())
    expect(r.originAddress?.name).toBe('Sender Corp')
    expect(r.originAddress?.city).toBe('Dubai')
  })

  it('maps consignee to destinationAddress', () => {
    const r = transformJeeblyShipment(makeRaw())
    expect(r.destinationAddress?.name).toBe('Bob')
    expect(r.destinationAddress?.city).toBe('Abu Dhabi')
  })

  it('maps weight', () => {
    const r = transformJeeblyShipment(makeRaw())
    expect(r.totalWeight?.value).toBe(2.0)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps cod_amount to cost amount', () => {
    const r = transformJeeblyShipment(makeRaw())
    expect(r.cost?.amount).toBe(100)
    expect(r.cost?.currency).toBe('AED')
  })

  it('maps reference', () => {
    expect(transformJeeblyShipment(makeRaw()).reference).toBe('REF-001')
  })

  it('createdAt is a Date', () => {
    expect(transformJeeblyShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('passes schema validation', () => {
    expect(() => ShipmentSchema.parse(transformJeeblyShipment(makeRaw()))).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const r = transformJeeblyShipment(
      makeRaw({ awb: null, weight: null, cod_amount: null, shipper: null, consignee: null }),
    )
    expect(r.trackingNumber).toBeUndefined()
    expect(r.totalWeight).toBeUndefined()
    expect(r.cost).toBeUndefined()
    expect(r.originAddress).toBeUndefined()
    expect(r.destinationAddress).toBeUndefined()
  })
})
