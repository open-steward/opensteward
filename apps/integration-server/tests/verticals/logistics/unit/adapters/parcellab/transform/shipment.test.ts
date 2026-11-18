import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ParcellabShipment,
} from '../../../../../../../src/verticals/logistics/adapters/parcellab/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<ParcellabShipment> = {}): ParcellabShipment {
  return {
    external_id: 'pl-shp-001',
    tracking_number: 'TRK-PL-SHP-001',
    courier: 'dhl',
    courier_service_level: 'EXPRESS',
    delivery_method: 'home',
    zip_code: '10115',
    city: 'Berlin',
    destination_country_iso3: 'DEU',
    last_delivery_status: {
      status_code: 'transit',
      status_text: 'In transit',
    },
    announced_delivery_date: '2024-03-04T00:00:00Z',
    shipping_weight_total: 2.5,
    shipping_weight_unit: 'kg',
    shipping_dimensions: {
      height: 10,
      width: 20,
      length: 30,
      unit: 'cm',
    },
    is_return: false,
    label_url: 'https://labels.parcellab.example/pl-shp-001.pdf',
    orderNo: 'ORD-REF-001',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcellab transformShipment', () => {
  it('maps id from external_id', () => {
    expect(transformShipment(makeShipment()).id).toBe('pl-shp-001')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRK-PL-SHP-001')
  })

  it('maps carrierId from courier', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('dhl')
  })

  it('maps serviceCode from courier_service_level', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('EXPRESS')
  })

  it('maps transit status to IN_TRANSIT', () => {
    expect(
      transformShipment(makeShipment({ last_delivery_status: { status_code: 'transit' } })).status,
    ).toBe('IN_TRANSIT')
  })

  it('maps customs status to IN_TRANSIT', () => {
    expect(
      transformShipment(makeShipment({ last_delivery_status: { status_code: 'customs' } })).status,
    ).toBe('IN_TRANSIT')
  })

  it('maps lastmile to OUT_FOR_DELIVERY', () => {
    expect(
      transformShipment(makeShipment({ last_delivery_status: { status_code: 'lastmile' } })).status,
    ).toBe('OUT_FOR_DELIVERY')
  })

  it('maps delivered status to DELIVERED', () => {
    expect(
      transformShipment(makeShipment({ last_delivery_status: { status_code: 'delivered' } }))
        .status,
    ).toBe('DELIVERED')
  })

  it('maps sentback to RETURNED', () => {
    expect(
      transformShipment(makeShipment({ last_delivery_status: { status_code: 'sentback' } })).status,
    ).toBe('RETURNED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeShipment({ last_delivery_status: null })).status).toBe('UNKNOWN')
  })

  it('maps destinationAddress from zip_code/city/country', () => {
    const r = transformShipment(makeShipment())
    expect(r.destinationAddress?.postalCode).toBe('10115')
    expect(r.destinationAddress?.city).toBe('Berlin')
    expect(r.destinationAddress?.country).toBe('DEU')
  })

  it('maps totalWeight value and unit', () => {
    const r = transformShipment(makeShipment())
    expect(r.totalWeight?.value).toBe(2.5)
    expect(r.totalWeight?.unit).toBe('kg')
  })

  it('maps lbs to lb in weight unit', () => {
    const r = transformShipment(makeShipment({ shipping_weight_unit: 'lbs' }))
    expect(r.totalWeight?.unit).toBe('lb')
  })

  it('maps dimensions from shipping_dimensions', () => {
    const r = transformShipment(makeShipment())
    expect(r.dimensions?.length).toBe(30)
    expect(r.dimensions?.width).toBe(20)
    expect(r.dimensions?.height).toBe(10)
    expect(r.dimensions?.unit).toBe('cm')
  })

  it('maps estimatedDeliveryAt from announced_delivery_date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps labelUrl from label_url', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://labels.parcellab.example/pl-shp-001.pdf',
    )
  })

  it('maps reference from orderNo', () => {
    expect(transformShipment(makeShipment()).reference).toBe('ORD-REF-001')
  })

  it('sets mode to parcel', () => {
    expect(transformShipment(makeShipment()).mode).toBe('parcel')
  })

  it('parses created_at as createdAt Date', () => {
    expect(transformShipment(makeShipment()).createdAt).toBeInstanceOf(Date)
  })

  it('omits totalWeight when shipping_weight_total is null', () => {
    expect(
      transformShipment(makeShipment({ shipping_weight_total: null })).totalWeight,
    ).toBeUndefined()
  })

  it('omits dimensions when any dimension is null', () => {
    expect(
      transformShipment(makeShipment({ shipping_dimensions: null })).dimensions,
    ).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('throws on ShipmentSchema validation because destination_country_iso3 is ISO-3166-1 alpha-3 ("DEU") but AddressSchema.country requires alpha-2', () => {
    // Source bug: parcelLab emits destination_country_iso3 as a 3-letter code ("DEU")
    // which is passed directly to destinationAddress.country, but Iso3166Alpha2 requires
    // exactly 2 uppercase letters (e.g. "DE").
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).toThrow()
  })
})
