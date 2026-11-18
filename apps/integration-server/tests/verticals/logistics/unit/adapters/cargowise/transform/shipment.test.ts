import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type CargowiseShipmentResponse,
} from '../../../../../../../src/verticals/logistics/adapters/cargowise/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(
  overrides: Partial<CargowiseShipmentResponse> = {},
): CargowiseShipmentResponse {
  return {
    shipmentId: 'CW-SHP-001',
    houseBillNumber: 'HBL123456',
    masterBillNumber: 'MBL789012',
    status: 'IN_TRANSIT',
    serviceCode: 'AIR_FREIGHT',
    transportMode: 'air',
    warehouseId: 'WH-FRA',
    originAddress: {
      street: '10 Cargo Drive',
      city: 'Frankfurt',
      state: 'HE',
      postCode: '60549',
      country: 'DE',
    },
    destinationAddress: {
      street: '200 Airport Blvd',
      city: 'Chicago',
      state: 'IL',
      postCode: '60666',
      country: 'US',
    },
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    // Still in transit — no actualDeliveryDate on the record yet.
    labelUrl: 'https://cargowise.example/labels/CW-SHP-001.pdf',
    reference: 'REF-2024-001',
    notes: 'Fragile cargo',
    createdDate: '2024-03-01T00:00:00Z',
    lastUpdatedDate: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformShipment (cargowise)', () => {
  it('maps id from shipmentId', () => {
    expect(transformShipment(makeShipment()).id).toBe('CW-SHP-001')
  })

  it('maps trackingNumber from houseBillNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('HBL123456')
  })

  it('falls back trackingNumber to masterBillNumber when houseBillNumber is absent', () => {
    const result = transformShipment(makeShipment({ houseBillNumber: undefined }))
    expect(result.trackingNumber).toBe('MBL789012')
  })

  it('sets carrierId to cargowise', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('cargowise')
  })

  it('maps status IN_TRANSIT → IN_TRANSIT', () => {
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps status DELIVERED → DELIVERED', () => {
    expect(transformShipment(makeShipment({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps status BOOKED → LABEL_CREATED', () => {
    expect(transformShipment(makeShipment({ status: 'BOOKED' })).status).toBe('LABEL_CREATED')
  })

  it('maps status CANCELLED → CANCELLED', () => {
    expect(transformShipment(makeShipment({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformShipment(makeShipment({ status: 'MYSTERY' })).status).toBe('UNKNOWN')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeShipment()).serviceCode).toBe('AIR_FREIGHT')
  })

  it('maps warehouseId', () => {
    expect(transformShipment(makeShipment()).warehouseId).toBe('WH-FRA')
  })

  it('maps originAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.street1).toBe('10 Cargo Drive')
    expect(result.originAddress?.city).toBe('Frankfurt')
    expect(result.originAddress?.country).toBe('DE')
  })

  it('maps destinationAddress', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.city).toBe('Chicago')
    expect(result.destinationAddress?.postalCode).toBe('60666')
  })

  it('maps estimatedDeliveryAt', () => {
    expect(transformShipment(makeShipment()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps labelUrl', () => {
    expect(transformShipment(makeShipment()).labelUrl).toContain('CW-SHP-001.pdf')
  })

  it('maps reference', () => {
    expect(transformShipment(makeShipment()).reference).toBe('REF-2024-001')
  })

  it('maps notes', () => {
    expect(transformShipment(makeShipment()).notes).toBe('Fragile cargo')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformShipment(makeShipment())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('omits originAddress when all fields are absent', () => {
    const result = transformShipment(
      makeShipment({
        originAddress: { street: '', city: '', state: '', postCode: '', country: '' },
      }),
    )
    expect(result.originAddress).toBeUndefined()
  })

  it('passes metadata as original raw object', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that parses against ShipmentSchema', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
