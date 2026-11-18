import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type EnviaYaShipment,
} from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeShipment(overrides: Partial<EnviaYaShipment> = {}): EnviaYaShipment {
  return {
    enviaya_shipment_number: 'EY-SHP-001',
    carrier_shipment_number: 'TRK-DHL-001',
    carrier: 'dhl',
    carrier_service_code: 'DHL_EXPRESS',
    shipment_status: 'in_transit',
    label_url: 'https://cdn.enviaya.com/labels/EY-SHP-001.pdf',
    estimated_delivery: '2024-03-04T00:00:00Z',
    actual_delivery_date: null,
    origin_direction: {
      full_name: 'Origin Name',
      direction_1: 'Calle Origen 1',
      city: 'CDMX',
      state_code: 'CDMX',
      postal_code: '06600',
      country_code: 'MX',
    },
    destination_direction: {
      full_name: 'Dest Name',
      direction_1: 'Calle Destino 5',
      city: 'Monterrey',
      state_code: 'NL',
      postal_code: '64000',
      country_code: 'MX',
    },
    shipment: {
      parcels: [
        {
          weight: 1.5,
          weight_unit: 'kg',
          length: 25,
          width: 15,
          height: 10,
          dimension_unit: 'cm',
        },
      ],
    },
    rate: {
      carrier: 'dhl',
      carrier_service_code: 'DHL_EXPRESS',
      total_amount: 290,
      currency: 'MXN',
    },
    reference: 'ORD-EY-2024',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id from enviaya_shipment_number', () => {
    // raw.enviaya_shipment_number → id — verified in source
    expect(transformShipment(makeShipment()).id).toBe('EY-SHP-001')
  })

  it('maps trackingNumber from carrier_shipment_number', () => {
    // raw.carrier_shipment_number → trackingNumber — verified in source
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRK-DHL-001')
  })

  it('maps status: in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status: delivered → DELIVERED', () => {
    expect(transformShipment(makeShipment({ shipment_status: 'delivered' })).status).toBe(
      'DELIVERED',
    )
  })

  it('maps status: label_created → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ shipment_status: 'label_created' })).status).toBe(
      'LABEL_CREATED',
    )
  })

  it('maps carrierId and serviceCode', () => {
    const result = transformShipment(makeShipment())
    expect(result.carrierId).toBe('dhl')
    expect(result.serviceCode).toBe('DHL_EXPRESS')
  })

  it('maps originAddress city', () => {
    expect(transformShipment(makeShipment()).originAddress?.city).toBe('CDMX')
  })

  it('maps destinationAddress city', () => {
    expect(transformShipment(makeShipment()).destinationAddress?.city).toBe('Monterrey')
  })

  it('maps totalWeight from first parcel', () => {
    const result = transformShipment(makeShipment())
    // shipment.parcels[0].weight → totalWeight — verified in source
    expect(result.totalWeight?.value).toBe(1.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps dimensions from first parcel', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(25)
    expect(result.dimensions?.unit).toBe('cm')
  })

  it('maps cost from rate object', () => {
    const result = transformShipment(makeShipment())
    expect(result.cost?.amount).toBe(290)
    expect(result.cost?.currency).toBe('MXN')
  })

  it('maps labelUrl and reference', () => {
    const result = transformShipment(makeShipment())
    expect(result.labelUrl).toBe('https://cdn.enviaya.com/labels/EY-SHP-001.pdf')
    expect(result.reference).toBe('ORD-EY-2024')
  })

  it('maps estimatedDeliveryAt to Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('parses as ShipmentSchema without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
