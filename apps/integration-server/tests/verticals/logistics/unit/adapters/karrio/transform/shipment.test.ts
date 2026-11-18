/**
 * Fixture: the documented Shipment 200 body (https://docs.karrio.io/reference/openapi,
 * schema Shipment), with its "string" placeholders replaced by plausible values of
 * the documented types. The documented example's country_code is "AC".
 */
import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type KarrioShipment,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<KarrioShipment> = {}): KarrioShipment {
  return {
    id: 'shp_5a2b',
    object_type: 'shipment',
    tracking_url: 'https://karrio.acme.example/tracking/trk_1',
    shipper: {
      id: 'adr_1',
      person_name: 'Alice',
      address_line1: '1 Origin St',
      city: 'New York',
      state_code: 'NY',
      postal_code: '10001',
      country_code: 'US',
      residential: false,
    },
    recipient: {
      id: 'adr_2',
      person_name: 'Bob',
      address_line1: '2 Dest Ave',
      city: 'Los Angeles',
      state_code: 'CA',
      postal_code: '90001',
      country_code: 'US',
      residential: false,
    },
    parcels: [
      {
        id: 'pcl_1',
        weight: 2.5,
        width: 10,
        height: 12,
        length: 20,
        weight_unit: 'KG',
        dimension_unit: 'CM',
      },
    ],
    status: 'in_transit',
    carrier_name: 'ups',
    carrier_id: 'ups-main',
    tracking_number: '1Z999AA10123456784',
    service: 'ups_ground',
    selected_rate: {
      id: 'rat_1',
      carrier_name: 'ups',
      carrier_id: 'ups-main',
      currency: 'USD',
      service: 'ups_ground',
      total_charge: 15.25,
      test_mode: false,
    },
    label_url: 'https://karrio.acme.example/v1/shipments/shp_5a2b/label.pdf',
    label_type: 'PDF',
    reference: 'REF-001',
    test_mode: false,
    created_at: '2024-03-01 09:30:00.000000+00:00',
    ...overrides,
  }
}

const parse = (raw: KarrioShipment) => ShipmentSchema.parse(transformShipment(raw))

describe('karrio transformShipment', () => {
  it('parses with ShipmentSchema', () => {
    expect(() => parse(makeRaw())).not.toThrow()
  })

  it('maps id, tracking number, carrier_id and service', () => {
    const s = parse(makeRaw())
    expect(s.id).toBe('shp_5a2b')
    expect(s.trackingNumber).toBe('1Z999AA10123456784')
    expect(s.carrierId).toBe('ups-main')
    expect(s.serviceCode).toBe('ups_ground')
    expect(s.reference).toBe('REF-001')
  })

  it.each([
    ['draft', 'PENDING'],
    ['purchased', 'LABEL_CREATED'],
    ['created', 'LABEL_CREATED'],
    ['shipped', 'IN_TRANSIT'],
    ['in_transit', 'IN_TRANSIT'],
    ['out_for_delivery', 'OUT_FOR_DELIVERY'],
    ['delivered', 'DELIVERED'],
    ['needs_attention', 'EXCEPTION'],
    ['delivery_failed', 'EXCEPTION'],
    ['cancelled', 'CANCELLED'],
  ])('documented status %s maps to %s', (raw, want) => {
    expect(parse(makeRaw({ status: raw })).status).toBe(want)
  })

  it('an undocumented or missing status is UNKNOWN', () => {
    expect(parse(makeRaw({ status: 'return_to_sender' })).status).toBe('UNKNOWN')
    expect(parse(makeRaw({ status: 'pending' })).status).toBe('UNKNOWN')
    expect(parse(makeRaw({ status: null })).status).toBe('UNKNOWN')
  })

  it('maps shipper and recipient', () => {
    const s = parse(makeRaw())
    expect(s.originAddress).toEqual(
      expect.objectContaining({ name: 'Alice', city: 'New York', country: 'US' }),
    )
    expect(s.destinationAddress).toEqual(
      expect.objectContaining({ name: 'Bob', city: 'Los Angeles', country: 'US' }),
    )
  })

  it('weight and dimensions carry the documented units', () => {
    const s = parse(makeRaw())
    expect(s.totalWeight).toEqual({ value: 2.5, unit: 'kg' })
    expect(s.dimensions).toEqual({ length: 20, width: 10, height: 12, unit: 'cm' })
    const lb = parse(
      makeRaw({
        parcels: [
          { weight: 3, weight_unit: 'LB', length: 5, width: 6, height: 7, dimension_unit: 'IN' },
        ],
      }),
    )
    expect(lb.totalWeight).toEqual({ value: 3, unit: 'lb' })
    expect(lb.dimensions).toEqual({ length: 5, width: 6, height: 7, unit: 'in' })
  })

  it('no unit, no weight or dimensions: units are never assumed', () => {
    const s = parse(makeRaw({ parcels: [{ weight: 2, width: 1, height: 1, length: 1 }] }))
    expect(s.totalWeight).toBeUndefined()
    expect(s.dimensions).toBeUndefined()
  })

  it('totalWeight sums several parcels in one unit; mixed units give none', () => {
    const two = parse(
      makeRaw({
        parcels: [
          { weight: 1.5, weight_unit: 'KG' },
          { weight: 2, weight_unit: 'KG' },
        ],
      }),
    )
    expect(two.totalWeight).toEqual({ value: 3.5, unit: 'kg' })
    expect(two.dimensions).toBeUndefined()
    const mixed = parse(
      makeRaw({
        parcels: [
          { weight: 1, weight_unit: 'KG' },
          { weight: 2, weight_unit: 'LB' },
        ],
      }),
    )
    expect(mixed.totalWeight).toBeUndefined()
  })

  it('cost is the selected rate in integer minor units of its currency', () => {
    expect(parse(makeRaw()).cost).toEqual({ amount: 1525, currency: 'USD' })
    const jpy = parse(
      makeRaw({ selected_rate: { carrier_id: 'x', total_charge: 1200, currency: 'JPY' } }),
    )
    expect(jpy.cost).toEqual({ amount: 1200, currency: 'JPY' })
  })

  it('no currency, or no selected rate, means no cost: nothing is defaulted', () => {
    expect(
      parse(makeRaw({ selected_rate: { carrier_id: 'x', total_charge: 15 } })).cost,
    ).toBeUndefined()
    expect(parse(makeRaw({ selected_rate: null })).cost).toBeUndefined()
    expect(
      parse(makeRaw({ selected_rate: { carrier_id: 'x', currency: 'USD', total_charge: null } }))
        .cost,
    ).toBeUndefined()
  })

  it('labelUrl only when absolute', () => {
    expect(parse(makeRaw()).labelUrl).toBe(
      'https://karrio.acme.example/v1/shipments/shp_5a2b/label.pdf',
    )
    expect(
      parse(makeRaw({ label_url: '/v1/shipments/shp_5a2b/label.pdf' })).labelUrl,
    ).toBeUndefined()
  })

  it('createdAt parses the documented "YYYY-MM-DD HH:MM:SS.mmmmmmz" format', () => {
    expect(parse(makeRaw()).createdAt).toEqual(new Date('2024-03-01T09:30:00.000Z'))
  })

  it('updatedAt is not documented and is never read', () => {
    const s = parse(makeRaw({ updated_at: '2024-03-02T00:00:00Z' }))
    expect(s.updatedAt).toBeUndefined()
  })

  it('a non-ISO country code from the documented enum ("AC") is omitted', () => {
    const s = parse(
      makeRaw({ recipient: { person_name: 'Bob', country_code: 'AC', city: 'Georgetown' } }),
    )
    expect(s.destinationAddress?.country).toBeUndefined()
    expect(s.destinationAddress?.city).toBe('Georgetown')
  })
})
