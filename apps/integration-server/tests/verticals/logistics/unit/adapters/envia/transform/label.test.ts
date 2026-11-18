import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type EnviaGuide,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeGuide(overrides: Partial<EnviaGuide> = {}): EnviaGuide {
  return {
    carrier: 'fedex',
    service: 'FEDEX_GROUND',
    trackingNumber: 'FX123456789MX',
    labelUrl: 'https://labels.envia.com/guides/FX123456789MX.pdf',
    labelFormat: 'PDF',
    totalPrice: 185.5,
    currency: 'MXN',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps carrierId and trackingNumber', () => {
    const result = transformLabel(makeGuide())
    // raw.carrier → carrierId, raw.trackingNumber → trackingNumber — verified in source
    expect(result.carrierId).toBe('fedex')
    expect(result.trackingNumber).toBe('FX123456789MX')
  })

  it('maps serviceCode and url', () => {
    const result = transformLabel(makeGuide())
    expect(result.serviceCode).toBe('FEDEX_GROUND')
    expect(result.url).toBe('https://labels.envia.com/guides/FX123456789MX.pdf')
  })

  it('status is always CREATED', () => {
    expect(transformLabel(makeGuide()).status).toBe('CREATED')
  })

  it('maps PDF format', () => {
    expect(transformLabel(makeGuide({ labelFormat: 'pdf' })).format).toBe('PDF')
  })

  it('maps ZPL format', () => {
    expect(transformLabel(makeGuide({ labelFormat: 'ZPL' })).format).toBe('ZPL')
  })

  it('maps PNG/image format', () => {
    expect(transformLabel(makeGuide({ labelFormat: 'IMAGE' })).format).toBe('PNG')
  })

  it('returns undefined format for unknown format', () => {
    expect(transformLabel(makeGuide({ labelFormat: 'CSV' })).format).toBeUndefined()
  })

  it('maps cost amount and currency (minor units)', () => {
    const result = transformLabel(makeGuide())
    expect(result.cost?.amount).toBe(18550)
    expect(result.cost?.currency).toBe('MXN')
  })

  it('omits cost when currency is absent', () => {
    const result = transformLabel(makeGuide({ currency: null }))
    expect(result.cost).toBeUndefined()
  })

  it('threads shipmentId through', () => {
    const result = transformLabel(makeGuide(), 'shp_999')
    expect(result.shipmentId).toBe('shp_999')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeGuide()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeGuide())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
