import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type InnoshipLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<InnoshipLabelResponse> = {}): InnoshipLabelResponse {
  return {
    awb: 'AWB-001',
    courierId: 3,
    pdfBase64: 'JVBERi0xLjQ=',
    labelUrl: null,
    format: 'PDF',
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('innoship transformLabel', () => {
  it('maps id from awb', () => {
    expect(transformLabel(makeLabel()).id).toBe('AWB-001')
  })

  it('maps trackingNumber from awb', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('AWB-001')
  })

  it('maps carrierId from courierId as string', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('3')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('sets status to CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps base64 from pdfBase64', () => {
    expect(transformLabel(makeLabel()).base64).toBe('JVBERi0xLjQ=')
  })

  it('maps url from labelUrl when present', () => {
    const result = transformLabel(makeLabel({ labelUrl: 'https://innoship.example/AWB-001.pdf' }))
    expect(result.url).toBe('https://innoship.example/AWB-001.pdf')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse without throwing', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })

  it('accepts optional shipmentId parameter and maps it', () => {
    const result = transformLabel(makeLabel(), 'shp-external-1')
    expect(result.shipmentId).toBe('shp-external-1')
  })

  it('falls back id to shipmentId when awb is null', () => {
    const result = transformLabel(makeLabel({ awb: null }), 'shp-fallback')
    expect(result.id).toBe('shp-fallback')
  })
})
