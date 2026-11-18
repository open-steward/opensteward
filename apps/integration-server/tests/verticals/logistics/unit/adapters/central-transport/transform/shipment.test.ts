import { describe, it, expect } from 'vitest'
import {
  transformShipment,
  type PiyoviShipmentResponse,
} from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/shipment'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeRaw(overrides: Partial<PiyoviShipmentResponse> = {}): PiyoviShipmentResponse {
  return {
    shipmentId: 'SHPMT-001',
    proNumber: 'PRO-001',
    bolNumber: 'BOL-001',
    status: 'BOOKED',
    serviceCode: 'LTL',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    createdAt: '2024-03-01T00:00:00Z',
    bolUrl: 'https://piyovi.io/labels/SHPMT-001.pdf',
    referenceNumber: 'REF-001',
    ...overrides,
  }
}

describe('central-transport transformShipment', () => {
  it('maps shipmentId to id', () => {
    expect(transformShipment(makeRaw()).id).toBe('SHPMT-001')
  })

  it('falls back to id field when shipmentId absent', () => {
    expect(transformShipment(makeRaw({ shipmentId: undefined, id: 'ALT-001' })).id).toBe('ALT-001')
  })

  it('maps carrierId to central-transport', () => {
    expect(transformShipment(makeRaw()).carrierId).toBe('central-transport')
  })

  it('hardcodes status to PENDING', () => {
    // Source always emits 'PENDING' regardless of raw status
    expect(transformShipment(makeRaw()).status).toBe('PENDING')
  })

  it('maps proNumber to trackingNumber', () => {
    expect(transformShipment(makeRaw()).trackingNumber).toBe('PRO-001')
  })

  it('maps serviceCode to serviceCode', () => {
    expect(transformShipment(makeRaw()).serviceCode).toBe('LTL')
  })

  it('prefers bolUrl over labelUrl', () => {
    const result = transformShipment(
      makeRaw({ bolUrl: 'https://piyovi.io/bol.pdf', labelUrl: 'https://piyovi.io/label.pdf' }),
    )
    expect(result.labelUrl).toBe('https://piyovi.io/bol.pdf')
  })

  it('falls back to labelUrl when bolUrl absent', () => {
    const result = transformShipment(
      makeRaw({ bolUrl: undefined, labelUrl: 'https://piyovi.io/label.pdf' }),
    )
    expect(result.labelUrl).toBe('https://piyovi.io/label.pdf')
  })

  it('maps referenceNumber to reference', () => {
    expect(transformShipment(makeRaw()).reference).toBe('REF-001')
  })

  it('maps estimatedDeliveryDate to estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformShipment(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps mode to ltl', () => {
    expect(transformShipment(makeRaw()).mode).toBe('ltl')
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies ShipmentSchema', () => {
    const result = transformShipment(makeRaw())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })

  it('handles all optional fields absent', () => {
    const result = transformShipment({})
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
