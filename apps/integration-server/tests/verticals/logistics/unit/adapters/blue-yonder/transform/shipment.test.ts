import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type BlueYonderShipmentResponse,
  type BlueYonderShipmentAddress,
} from '../../../../../../../src/verticals/logistics/adapters/blue-yonder/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeAddress(
  overrides: Partial<BlueYonderShipmentAddress> = {},
): BlueYonderShipmentAddress {
  return {
    name: 'Acme Corp',
    company: 'Acme',
    streetAddress: '1 Shipment Way',
    streetAddress2: 'Suite 100',
    city: 'Memphis',
    stateOrProvince: 'TN',
    postalCode: '38101',
    countryCode: 'US',
    phone: '+1-555-0100',
    email: 'ship@acme.example',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<BlueYonderShipmentResponse> = {}): BlueYonderShipmentResponse {
  return {
    shipmentId: 'BY-SHP-001',
    referenceNumber: 'REF-001',
    serviceCode: 'GROUND',
    status: 'IN_TRANSIT',
    mode: 'parcel',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    actualDeliveryDate: '2024-03-04T00:00:00Z',
    trackingNumber: 'TRK-BY-001',
    carrierId: 'fedex',
    weight: { value: 5.5, unit: 'kg' },
    originAddress: makeAddress({ city: 'Memphis', stateOrProvince: 'TN' }),
    destinationAddress: makeAddress({ city: 'Austin', stateOrProvince: 'TX', postalCode: '78701' }),
    ...overrides,
  }
}

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id from shipmentId', () => {
    expect(transformShipment(makeRaw()).id).toBe('BY-SHP-001')
  })

  it('maps carrierId from raw.carrierId', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('fedex')
  })

  it('defaults carrierId to "blue-yonder" when raw.carrierId is absent', () => {
    expect(transformShipment(makeRaw({ carrierId: undefined })).carrierId).toBe('blue-yonder')
  })

  it('maps trackingNumber from raw.trackingNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('TRK-BY-001')
  })

  it('falls back to referenceNumber when trackingNumber is absent', () => {
    const result = transformShipment(makeRaw({ trackingNumber: undefined }))
    expect(result.trackingNumber).toBe('REF-001')
  })

  it('maps serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('GROUND')
  })

  // ── Status mapping ───────────────────────────────────────────────────────

  it('maps IN_TRANSIT status to IN_TRANSIT', () => {
    expect(transformShipment(makeRaw({ status: 'IN_TRANSIT' })).status).toBe('IN_TRANSIT')
  })

  it('maps CREATED status to LABEL_CREATED', () => {
    expect(transformShipment(makeRaw({ status: 'CREATED' })).status).toBe('LABEL_CREATED')
  })

  it('maps PLANNED status to PENDING', () => {
    expect(transformShipment(makeRaw({ status: 'PLANNED' })).status).toBe('PENDING')
  })

  it('maps TENDERED status to PENDING', () => {
    expect(transformShipment(makeRaw({ status: 'TENDERED' })).status).toBe('PENDING')
  })

  it('maps OUT_FOR_DELIVERY status to OUT_FOR_DELIVERY', () => {
    expect(transformShipment(makeRaw({ status: 'OUT_FOR_DELIVERY' })).status).toBe(
      'OUT_FOR_DELIVERY',
    )
  })

  it('maps DELIVERED status to DELIVERED', () => {
    expect(transformShipment(makeRaw({ status: 'DELIVERED' })).status).toBe('DELIVERED')
  })

  it('maps EXCEPTION status to EXCEPTION', () => {
    expect(transformShipment(makeRaw({ status: 'EXCEPTION' })).status).toBe('EXCEPTION')
  })

  it('maps RETURNED status to RETURNED', () => {
    expect(transformShipment(makeRaw({ status: 'RETURNED' })).status).toBe('RETURNED')
  })

  it('maps CANCELLED status to CANCELLED', () => {
    expect(transformShipment(makeRaw({ status: 'CANCELLED' })).status).toBe('CANCELLED')
  })

  it('maps unknown status to UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: 'SOME_FUTURE_STATUS' })).status).toBe('UNKNOWN')
  })

  it('maps undefined status to UNKNOWN', () => {
    expect(transformShipment(makeRaw({ status: undefined })).status).toBe('UNKNOWN')
  })

  // ── Weight mapping ───────────────────────────────────────────────────────

  it('maps weight with unit "kg"', () => {
    const result = transformShipment(makeRaw({ weight: { value: 5.5, unit: 'kg' } }))
    expect(result.totalWeight?.value).toBe(5.5)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps weight with unit "KG"', () => {
    const result = transformShipment(makeRaw({ weight: { value: 10, unit: 'KG' } }))
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('maps weight with non-kg unit to lb', () => {
    const result = transformShipment(makeRaw({ weight: { value: 12, unit: 'LB' } }))
    expect(result.totalWeight?.unit).toBe('lb')
  })

  // ── Address mapping ──────────────────────────────────────────────────────

  it('maps originAddress fields via toAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.originAddress?.city).toBe('Memphis')
    expect(result.originAddress?.state).toBe('TN')
    expect(result.originAddress?.country).toBe('US')
    expect(result.originAddress?.street1).toBe('1 Shipment Way')
  })

  it('maps destinationAddress fields via toAddress', () => {
    const result = transformShipment(makeRaw())
    expect(result.destinationAddress?.city).toBe('Austin')
    expect(result.destinationAddress?.state).toBe('TX')
  })

  it('returns undefined originAddress when raw.originAddress is absent', () => {
    expect(transformShipment(makeRaw({ originAddress: undefined })).originAddress).toBeUndefined()
  })

  // ── Date mapping ─────────────────────────────────────────────────────────

  it('maps estimatedDeliveryAt as a Date', () => {
    const result = transformShipment(makeRaw())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-05T00:00:00.000Z')
  })

  it('maps actualDeliveryAt as a Date', () => {
    const result = transformShipment(makeRaw())
    expect(result.actualDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt as a Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt as a Date', () => {
    expect(transformShipment(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  // ── Metadata ─────────────────────────────────────────────────────────────

  it('passes metadata as the raw response', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  // ── Schema validation ─────────────────────────────────────────────────────

  it('passes ShipmentSchema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeRaw()))).not.toThrow()
  })

  it('passes ShipmentSchema validation with minimal raw data', () => {
    const raw: BlueYonderShipmentResponse = { shipmentId: 'BY-MIN-001' }
    expect(() => ShipmentSchema.parse(transformShipment(raw))).not.toThrow()
  })
})
