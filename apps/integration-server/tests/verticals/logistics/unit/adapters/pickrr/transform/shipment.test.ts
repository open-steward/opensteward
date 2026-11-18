import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type PickrrShipment,
} from '../../../../../../../src/verticals/logistics/adapters/pickrr/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<PickrrShipment> = {}): PickrrShipment {
  return {
    order_pk: 55001,
    tracking_id: 'PCKR-SHP-001',
    order_service_used: 'BlueDart',
    status: 'in_transit',
    to_name: 'To Person',
    to_phone_number: '+919999999991',
    to_email: 'to@example.in',
    to_address: '1 To Road',
    to_city: 'Chennai',
    to_state: 'Tamil Nadu',
    to_pincode: '600001',
    to_country: 'India',
    from_name: 'From Person',
    from_phone_number: '+919999999990',
    from_address: '2 From Road',
    from_city: 'Hyderabad',
    from_state: 'Telangana',
    from_pincode: '500001',
    from_country: 'India',
    item_name: 'Gadget',
    weight: 0.8,
    label_url: 'https://labels.pickrr.example/55001.pdf',
    estimated_delivery_date: '2024-03-04T00:00:00Z',
    delivered_date: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('pickrr transformShipment', () => {
  it('maps id from order_pk as string', () => {
    expect(transformShipment(makeShipment()).id).toBe('55001')
  })

  it('falls back id to tracking_id when order_pk is null', () => {
    expect(transformShipment(makeShipment({ order_pk: null })).id).toBe('PCKR-SHP-001')
  })

  it('maps trackingNumber from tracking_id', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('PCKR-SHP-001')
  })

  it('maps carrierId from order_service_used', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('BlueDart')
  })

  it('maps IN_TRANSIT status for in_transit', () => {
    expect(transformShipment(makeShipment({ status: 'in_transit' })).status).toBe('IN_TRANSIT')
  })

  it('maps IN_TRANSIT status for dispatched', () => {
    expect(transformShipment(makeShipment({ status: 'dispatched' })).status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps OUT_FOR_DELIVERY status', () => {
    expect(transformShipment(makeShipment({ status: 'out_for_delivery' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps CANCELLED status', () => {
    expect(transformShipment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps RETURNED for rto status', () => {
    expect(transformShipment(makeShipment({ status: 'rto delivered' })).status).toBe('RETURNED')
  })

  it('maps LABEL_CREATED for pickup/label status', () => {
    expect(transformShipment(makeShipment({ status: 'label created' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps EXCEPTION for exception status', () => {
    expect(transformShipment(makeShipment({ status: 'exception' })).status).toBe('EXCEPTION')
  })

  it('maps UNKNOWN for null status', () => {
    expect(transformShipment(makeShipment({ status: null })).status).toBe('UNKNOWN')
  })

  it('maps originAddress from from_* fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.originAddress?.name).toBe('From Person')
    expect(r.originAddress?.city).toBe('Hyderabad')
    expect(r.originAddress?.postalCode).toBe('500001')
  })

  it('maps destinationAddress from to_* fields', () => {
    const r = transformShipment(makeShipment())
    expect(r.destinationAddress?.name).toBe('To Person')
    expect(r.destinationAddress?.city).toBe('Chennai')
  })

  it('maps totalWeight from weight in kg', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(0.8)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('omits totalWeight when weight is null', () => {
    expect(transformShipment(makeShipment({ weight: null })).totalWeight).toBeUndefined()
  })

  it('maps labelUrl from label_url', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://labels.pickrr.example/55001.pdf',
    )
  })

  it('maps estimatedDeliveryAt from estimated_delivery_date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps actualDeliveryAt from delivered_date when present', () => {
    const r = transformShipment(makeShipment({ delivered_date: '2024-03-03T00:00:00Z' }))
    expect(r.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('parses created_at as createdAt Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('throws on ShipmentSchema validation because from_country/to_country "India" is not ISO 3166-1 alpha-2 but AddressSchema.country requires it', () => {
    // Source bug: pickrr passes to_country/from_country as "India" (the full country name),
    // but AddressSchema.country uses Iso3166Alpha2 which requires exactly 2 uppercase letters
    // (e.g. "IN"). The adapter defaults to "India" when country is null, making this always fail.
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).toThrow()
  })
})
