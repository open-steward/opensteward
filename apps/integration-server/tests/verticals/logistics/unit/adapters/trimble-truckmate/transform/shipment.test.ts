import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type TrimbleTruckmateShipmentResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeShipment(
  overrides: Partial<TrimbleTruckmateShipmentResponse> = {},
): TrimbleTruckmateShipmentResponse {
  return {
    shipmentId: 'SHP-001',
    status: 'IN_TRANSIT',
    trackingNumber: 'TRK-001',
    carrierId: 'trimble-truckmate',
    serviceCode: 'FTL',
    warehouseId: 'WH-001',
    origin: {
      name: 'Alice Origin',
      company: 'Origin Co',
      address: '100 Origin Rd',
      city: 'Nashville',
      state: 'TN',
      zipCode: '37201',
      country: 'US',
      phone: '+16155550101',
      email: 'alice@example.com',
    },
    destination: {
      name: 'Bob Dest',
      company: 'Dest LLC',
      address: '200 Dest Ave',
      city: 'Memphis',
      state: 'TN',
      zipCode: '38101',
      country: 'US',
    },
    totalWeight: { value: 5000, unit: 'lb' },
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    actualDeliveryDate: '2024-03-06T00:00:00Z',
    reference: 'ORD-999',
    notes: 'Handle with care',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('trimble-truckmate transformShipment', () => {
  it('maps id from shipmentId', () => {
    expect(transformShipment(makeShipment()).id).toBe('SHP-001')
  })

  it('maps status IN_TRANSIT to canonical IN_TRANSIT', () => {
    // Verified in SHIPMENT_STATUS_MAP: IN_TRANSIT → 'IN_TRANSIT'
    expect(transformShipment(makeShipment()).status).toBe('IN_TRANSIT')
  })

  it('maps trackingNumber', () => {
    expect(transformShipment(makeShipment()).trackingNumber).toBe('TRK-001')
  })

  it('maps carrierId', () => {
    expect(transformShipment(makeShipment()).carrierId).toBe('trimble-truckmate')
  })

  it('maps origin address fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.city).toBe('Nashville')
    expect(result.originAddress?.state).toBe('TN')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination address fields', () => {
    const result = transformShipment(makeShipment())
    expect(result.destinationAddress?.city).toBe('Memphis')
    expect(result.destinationAddress?.postalCode).toBe('38101')
  })

  it('maps totalWeight value and unit', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(5000)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('normalises kg unit', () => {
    const result = transformShipment(makeShipment({ totalWeight: { value: 100, unit: 'kg' } }))
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps estimatedDeliveryAt and actualDeliveryAt as Date', () => {
    const result = transformShipment(makeShipment())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps reference and notes', () => {
    const result = transformShipment(makeShipment())
    expect(result.reference).toBe('ORD-999')
    expect(result.notes).toBe('Handle with care')
  })

  it('sets mode to ftl', () => {
    expect(transformShipment(makeShipment()).mode).toBe('ftl')
  })

  it('maps PENDING status', () => {
    // SHIPMENT_STATUS_MAP: PENDING → 'PENDING'
    expect(transformShipment(makeShipment({ status: 'PENDING' })).status).toBe('PENDING')
  })

  it('returns undefined status for unknown code', () => {
    expect(transformShipment(makeShipment({ status: 'NOPE' })).status).toBeUndefined()
  })

  it('passes metadata through', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeShipment()))).not.toThrow()
  })
})
