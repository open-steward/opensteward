import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/label'
import type { PiyoviShipmentResponse } from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<PiyoviShipmentResponse> = {}): PiyoviShipmentResponse {
  return {
    shipmentId: 'SHPMT-001',
    proNumber: 'PRO-001',
    bolNumber: 'BOL-001',
    serviceCode: 'LTL',
    bolUrl: 'https://piyovi.io/labels/SHPMT-001.pdf',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('central-transport transformLabel', () => {
  it('maps shipmentId to id and shipmentId', () => {
    const result = transformLabel(makeRaw())
    expect(result.id).toBe('SHPMT-001')
    expect(result.shipmentId).toBe('SHPMT-001')
  })

  it('maps proNumber to trackingNumber', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('PRO-001')
  })

  it('maps carrierId to central-transport', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('central-transport')
  })

  it('maps serviceCode to serviceCode', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('LTL')
  })

  it('prefers bolUrl over labelUrl for url field', () => {
    const result = transformLabel(
      makeRaw({ bolUrl: 'https://piyovi.io/bol.pdf', labelUrl: 'https://piyovi.io/label.pdf' }),
    )
    expect(result.url).toBe('https://piyovi.io/bol.pdf')
  })

  it('falls back to labelUrl when bolUrl absent', () => {
    const result = transformLabel(
      makeRaw({ bolUrl: undefined, labelUrl: 'https://piyovi.io/label.pdf' }),
    )
    expect(result.url).toBe('https://piyovi.io/label.pdf')
  })

  it('sets format to PDF when url is present', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('sets format to undefined when url absent', () => {
    const result = transformLabel(makeRaw({ bolUrl: undefined, labelUrl: undefined }))
    expect(result.format).toBeUndefined()
  })

  it('hardcodes status to CREATED', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies LabelSchema', () => {
    const result = transformLabel(makeRaw())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles empty input', () => {
    const result = transformLabel({})
    expect(result.id).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(result.format).toBeUndefined()
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
