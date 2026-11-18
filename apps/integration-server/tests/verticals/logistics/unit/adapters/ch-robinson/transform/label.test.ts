import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type CHRLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/ch-robinson/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<CHRLabelResponse> = {}): CHRLabelResponse {
  return {
    labelId: 'LBL-001',
    shipmentId: 'SHP-001',
    trackingNumber: 'PRO-001',
    serviceCode: 'LTL_STD',
    format: 'PDF',
    status: 'CREATED',
    url: 'https://api.chrobinson.com/labels/LBL-001.pdf',
    // URL-delivered label — no inline base64 content on the response.
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('ch-robinson transformLabel', () => {
  it('maps labelId to id', () => {
    expect(transformLabel(makeRaw()).id).toBe('LBL-001')
  })

  it('maps shipmentId to shipmentId', () => {
    expect(transformLabel(makeRaw()).shipmentId).toBe('SHP-001')
  })

  it('maps trackingNumber to trackingNumber', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('PRO-001')
  })

  it('maps carrierId to ch-robinson', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('ch-robinson')
  })

  it('maps serviceCode to serviceCode', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('LTL_STD')
  })

  it('maps format to format', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps status to status', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps url to url', () => {
    expect(transformLabel(makeRaw()).url).toBe('https://api.chrobinson.com/labels/LBL-001.pdf')
  })

  it('maps base64 to base64', () => {
    const result = transformLabel(makeRaw({ base64: 'abc123==' }))
    expect(result.base64).toBe('abc123==')
  })

  it('maps createdAt to createdAt as Date', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt to updatedAt as Date', () => {
    expect(transformLabel(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces output that satisfies LabelSchema', () => {
    const result = transformLabel(makeRaw())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields', () => {
    const result = transformLabel({})
    expect(result.id).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
