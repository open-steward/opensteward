import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type CHRShipmentResponse,
} from '../../../../../../../src/verticals/logistics/adapters/ch-robinson/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<CHRShipmentResponse> = {}): CHRShipmentResponse {
  return {
    loadId: 'LOAD-001',
    shipmentId: 'SHP-001',
    referenceNumber: 'REF-001',
    proNumber: 'PRO-001',
    bolNumber: 'BOL-001',
    status: 'InTransit',
    serviceMode: 'LTL',
    serviceType: 'LTL_STD',
    pickupDate: '2024-03-01T00:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    // status is InTransit — no actual deliveryDate on the record yet.
    origin: {
      name: 'Warehouse A',
      companyName: 'Shipper Co',
      address1: '100 Shipper Blvd',
      city: 'Chicago',
      stateProvince: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    destination: {
      name: 'Receiver B',
      companyName: 'Receiver LLC',
      address1: '200 Receiver Ave',
      city: 'Dallas',
      stateProvince: 'TX',
      postalCode: '75201',
      country: 'US',
    },
    totalWeight: { value: 3500, unit: 'lb' },
    totalCost: { amount: 1200.0, currency: 'USD' },
    labelUrl: 'https://api.chrobinson.com/labels/BOL-001.pdf',
    notes: 'Fragile cargo',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('ch-robinson transformShipment', () => {
  it('maps loadId to id', () => {
    expect(transformShipment(makeRaw()).id).toBe('LOAD-001')
  })

  it('falls back to shipmentId when loadId absent', () => {
    expect(transformShipment(makeRaw({ loadId: undefined })).id).toBe('SHP-001')
  })

  it('maps carrierId to ch-robinson', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('ch-robinson')
  })

  it('maps InTransit status to IN_TRANSIT', () => {
    expect(transformShipment(makeRaw()).status).toBe('IN_TRANSIT')
  })

  it('maps proNumber to trackingNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('PRO-001')
  })

  it('maps serviceType to serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('LTL_STD')
  })

  it('maps serviceMode ltl to mode ltl', () => {
    expect(transformShipment(makeRaw({ serviceMode: 'LTL' })).mode).toBe('ltl')
  })

  it('maps serviceMode FTL to mode ftl', () => {
    expect(transformShipment(makeRaw({ serviceMode: 'FTL' })).mode).toBe('ftl')
  })

  it('maps totalWeight value and unit', () => {
    const result = transformShipment(makeRaw())
    expect(result.totalWeight?.value).toBeCloseTo(3500)
    expect(result.totalWeight?.unit).toBe('lb')
  })

  it('maps totalWeight unit kg when specified', () => {
    const result = transformShipment(makeRaw({ totalWeight: { value: 1000, unit: 'kg' } }))
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps totalCost amount and currency', () => {
    const result = transformShipment(makeRaw())
    expect(result.cost?.amount).toBeCloseTo(1200.0)
    expect(result.cost?.currency).toBe('USD')
  })

  it('maps origin to originAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Chicago')
    expect(result.originAddress?.state).toBe('IL')
    expect(result.originAddress?.country).toBe('US')
  })

  it('maps destination to destinationAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Dallas')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps bolNumber to reference', () => {
    expect(transformShipment(makeRaw()).reference).toBe('BOL-001')
  })

  it('maps notes to notes', () => {
    expect(transformShipment(makeRaw()).notes).toBe('Fragile cargo')
  })

  it('maps estimatedDeliveryDate to estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps labelUrl to labelUrl', () => {
    expect(transformShipment(makeRaw()).labelUrl).toBe(
      'https://api.chrobinson.com/labels/BOL-001.pdf',
    )
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies ShipmentSchema', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('maps Delivered status to DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'Delivered' })).status).toBe('DELIVERED')
  })

  it('maps Cancelled status to CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'Cancelled' })).status).toBe('CANCELLED')
  })

  it('handles missing optional fields', () => {
    const result = transformShipment({})
    expect(result.id).toBeUndefined()
    expect(result.status).toBe('UNKNOWN')
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('returns undefined cost when totalCost.amount absent', () => {
    expect(transformShipment(makeRaw({ totalCost: { currency: 'USD' } })).cost).toBeUndefined()
  })
})
