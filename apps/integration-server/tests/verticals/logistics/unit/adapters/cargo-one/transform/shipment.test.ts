import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type CargoOneShipment,
} from '../../../../../../../src/verticals/logistics/adapters/cargo-one/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<CargoOneShipment> = {}): CargoOneShipment {
  return {
    id: 'cgo-shp-001',
    status: 'in_transit',
    reference: 'REF-2024-001',
    tracking_number: 'C1TRK123456',
    carrier_id: 'lufthansa_cargo',
    carrier_name: 'Lufthansa Cargo',
    service_code: 'AIR_EXPRESS',
    mode: 'air',
    origin: {
      name: 'Alice Shipper',
      company: 'Acme Exports',
      street: '10 Cargo Drive',
      street2: 'Suite A',
      city: 'Frankfurt',
      state: 'HE',
      postal_code: '60549',
      country_code: 'DE',
      phone: '+4969696969',
      email: 'alice@acme.example',
    },
    destination: {
      name: 'Bob Importer',
      company: 'Import Corp',
      street: '200 Airport Blvd',
      city: 'Chicago',
      state: 'IL',
      postal_code: '60666',
      country_code: 'US',
      phone: '+13125550000',
      email: 'bob@importcorp.example',
    },
    weight: 10.5,
    weight_unit: 'kg',
    chargeable_weight: 12.0,
    label_url: 'https://app.cargo.one/labels/cgo-shp-001.pdf',
    total_amount: 850.0,
    currency: 'EUR',
    notes: 'Handle with care',
    estimated_delivery_at: '2024-03-05T00:00:00Z',
    actual_delivery_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (cargo-one)', () => {
  it('maps id', () => {
    expect(transformShipment(makeShipment()).id).toBe('cgo-shp-001')
  })

  it('maps status in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status booked → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'booked' })).status).toBe('LABEL_CREATED')
  })

  it('maps status delivered → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'delivered' })).status).toBe('DELIVERED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'mystery' })).status).toBe('UNKNOWN')
  })

  it('maps trackingNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('C1TRK123456')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('lufthansa_cargo')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('AIR_EXPRESS')
  })

  it('maps mode air → air', () => {
    expect(transformShipment(makeShipment()).mode).toBe('air')
  })

  it('maps mode ocean → ocean', () => {
    expect(transformShipment(makeShipment({ mode: 'ocean' })).mode).toBe('ocean')
  })

  it('maps originAddress from origin', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Shipper')
    expect(result.originAddress?.city).toBe('Frankfurt')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('maps destinationAddress from destination', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob Importer')
    expect(result.destinationAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.postalCode).toBe('60666')
  })

  it('prefers chargeable_weight over weight for totalWeight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(12)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('falls back to weight when chargeable_weight is null', () => {
    const result = transformShipment(makeShipment({ chargeable_weight: null }))
    expect(result.totalWeight?.value).toBe(10.5)
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toContain('cgo-shp-001.pdf')
  })

  it('maps cost from total_amount and currency', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(850)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps reference', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-2024-001')
  })

  it('maps notes', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Handle with care')
  })

  it('maps estimatedDeliveryAt', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformShipment(
      makeShipment({
        status: null,
        tracking_number: null,
        carrier_id: null,
        carrier_name: null,
        origin: null,
        destination: null,
        weight: null,
        chargeable_weight: null,
        total_amount: null,
        currency: null,
        label_url: null,
        reference: null,
        notes: null,
        estimated_delivery_at: null,
        created_at: null,
        updated_at: null,
      }),
    )
    expect(result.status).toBe('UNKNOWN')
    expect(result.trackingNumber).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.totalWeight).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
