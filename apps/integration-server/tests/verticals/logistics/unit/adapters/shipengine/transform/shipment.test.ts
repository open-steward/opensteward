import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type ShipEngineShipment,
} from '../../../../../../../src/verticals/logistics/adapters/shipengine/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(overrides: Partial<ShipEngineShipment> = {}): ShipEngineShipment {
  return {
    shipment_id: 'se-shp-001',
    shipment_status: 'in_transit',
    carrier_id: 'se-12345',
    carrier_code: 'ups',
    service_code: 'ups_ground',
    tracking_number: '1Z999AA10123456784',
    warehouse_id: 'se-wh-001',
    ship_from: {
      name: 'Alice Sender',
      address_line1: '1 Market St',
      city_locality: 'San Francisco',
      state_province: 'CA',
      postal_code: '94105',
      country_code: 'US',
      email: 'alice@acme.example',
    },
    ship_to: {
      name: 'Bob Receiver',
      address_line1: '100 Main Ave',
      city_locality: 'Los Angeles',
      state_province: 'CA',
      postal_code: '90001',
      country_code: 'US',
      email: 'bob@example.example',
    },
    total_weight: { value: 2.5, unit: 'pound' },
    packages: [
      {
        package_id: 'pkg-001',
        tracking_number: '1Z999AA10123456784',
        dimensions: { unit: 'inch', length: 12, width: 8, height: 4 },
      },
    ],
    shipping_amount: { currency: 'USD', amount: 15 },
    label_download: {
      href: 'https://api.shipengine.com/v1/downloads/se-lbl-001.pdf',
    },
    reference: 'ORD-001',
    estimated_delivery_date: '2024-03-05T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    modified_at: '2024-03-01T08:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (shipengine)', () => {
  it('maps id from shipment_id', () => {
    expect(transformShipment(makeShipment()).id).toBe('se-shp-001')
  })

  it('maps status: in_transit → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('se-12345')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('ups_ground')
  })

  it('maps warehouseId from warehouse_id', () => {
    expect(transformShipment(makeShipment()).warehouseId).toBe('se-wh-001')
  })

  it('maps reference from reference field', () => {
    expect(transformShipment(makeShipment()).reference).toBe('ORD-001')
  })

  it('maps originAddress from ship_from', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Alice Sender')
    expect(result.originAddress?.city).toBe('San Francisco')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destinationAddress from ship_to', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.name).toBe('Bob Receiver')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
  })

  it('maps totalWeight from total_weight with unit conversion (pound → lb)', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(2.5)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps dimensions from first package in inches', () => {
    const result = transformShipment(makeShipment())
    expect(result.dimensions?.length).toBe(12)
    expect(result.dimensions?.unit).toBe('in')
  })

  it('maps cost from shipping_amount', () => {
    const result = transformShipment(
      makeShipment({ shipping_amount: { currency: 'USD', amount: 1500 } }),
    )
    expect(result.cost?.amount).toBe(1500)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps labelUrl from label_download.href', () => {
    expect(transformShipment(makeShipment()).labelUrl).toBe(
      'https://api.shipengine.com/v1/downloads/se-lbl-001.pdf',
    )
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt and updatedAt as Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PENDING'],
      ['label_created', 'LABEL_CREATED'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'OUT_FOR_DELIVERY'],
      ['return_to_sender', 'RETURNED'],
      ['returned', 'RETURNED'],
      ['cancelled', 'CANCELLED'],
      ['exception', 'EXCEPTION'],
      ['failure', 'EXCEPTION'],
      ['error', 'EXCEPTION'],
      ['unknown_status', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      expect(transformShipment(makeShipment({ shipment_status: status })).status).toBe(expected)
    }
  })

  it('passes ShipmentSchema.parse without throwing', () => {
    const result = transformShipment(makeShipment())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
