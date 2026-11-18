import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type CargoOneLabel,
} from '../../../../../../../src/verticals/logistics/adapters/cargo-one/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<CargoOneLabel> = {}): CargoOneLabel {
  return {
    id: 'lbl-001',
    shipment_id: 'cgo-shp-001',
    tracking_number: 'C1TRK123456',
    carrier_id: 'lufthansa_cargo',
    service_code: 'AIR_EXPRESS',
    format: 'pdf',
    status: 'created',
    url: 'https://app.cargo.one/labels/lbl-001.pdf',
    base64: null,
    amount: 25.0,
    currency: 'EUR',
    voided_at: null,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (cargo-one)', () => {
  it('maps id', () => {
    expect(transformLabel(makeLabel()).id).toBe('lbl-001')
  })

  it('maps shipmentId', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('cgo-shp-001')
  })

  it('maps trackingNumber', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('C1TRK123456')
  })

  it('maps carrierId', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('lufthansa_cargo')
  })

  it('maps serviceCode', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('AIR_EXPRESS')
  })

  it('maps format pdf → PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps format png → PNG', () => {
    expect(transformLabel(makeLabel({ format: 'png' })).format).toBe('PNG')
  })

  it('maps format zpl → ZPL', () => {
    expect(transformLabel(makeLabel({ format: 'zpl' })).format).toBe('ZPL')
  })

  it('maps status created → CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps status voided → VOIDED', () => {
    expect(transformLabel(makeLabel({ status: 'voided' })).status).toBe('VOIDED')
  })

  it('maps url', () => {
    expect(transformLabel(makeLabel()).url).toContain('lbl-001.pdf')
  })

  it('maps cost from amount and currency', () => {
    const result = transformLabel(makeLabel())
    expect(result.cost?.amount).toBe(25)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles null optional fields gracefully', () => {
    const result = transformLabel(
      makeLabel({ format: null, status: null, url: null, amount: null, currency: null }),
    )
    expect(result.format).toBeUndefined()
    // status falls back to 'CREATED' when null
    expect(result.status).toBe('CREATED')
    expect(result.url).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })

  it('produces output that parses against LabelSchema', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })
})
