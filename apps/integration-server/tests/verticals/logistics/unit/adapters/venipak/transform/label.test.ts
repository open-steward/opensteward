import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type VenipakLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/venipak/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<VenipakLabelResponse> = {}): VenipakLabelResponse {
  return {
    pack_no: 'VP123456789LT',
    label_url: 'https://api.venipak.com/labels/VP123456789LT.pdf',
    label_base64: null,
    label_format: 'PDF',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (venipak)', () => {
  it('maps id from pack_no', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('VP123456789LT')
  })

  it('maps trackingNumber from pack_no', () => {
    const result = transformLabel(makeLabel())
    expect(result.trackingNumber).toBe('VP123456789LT')
  })

  it('maps shipmentId from argument', () => {
    const result = transformLabel(makeLabel(), 'shp-001')
    expect(result.shipmentId).toBe('shp-001')
  })

  it('hardcodes carrierId to venipak', () => {
    const result = transformLabel(makeLabel())
    expect(result.carrierId).toBe('venipak')
  })

  it('hardcodes format to PDF', () => {
    const result = transformLabel(makeLabel())
    expect(result.format).toBe('PDF')
  })

  it('hardcodes status to CREATED', () => {
    const result = transformLabel(makeLabel())
    expect(result.status).toBe('CREATED')
  })

  it('maps url from label_url', () => {
    const result = transformLabel(makeLabel())
    expect(result.url).toBe('https://api.venipak.com/labels/VP123456789LT.pdf')
  })

  it('maps base64 from label_base64', () => {
    const result = transformLabel(makeLabel({ label_base64: 'JVBERi0x...' }))
    expect(result.base64).toBe('JVBERi0x...')
  })

  it('maps createdAt as a Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('falls back id to shipmentId argument when pack_no is null', () => {
    const result = transformLabel(makeLabel({ pack_no: null }), 'shp-fallback')
    expect(result.id).toBe('shp-fallback')
  })

  it('passes metadata through as raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema.parse without throwing', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
