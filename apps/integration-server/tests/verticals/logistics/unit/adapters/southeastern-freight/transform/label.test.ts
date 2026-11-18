import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type SeflDocumentItem,
} from '../../../../../../../src/verticals/logistics/adapters/southeastern-freight/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<SeflDocumentItem> = {}): SeflDocumentItem {
  return {
    pro: 'PRO-SEFL-001',
    base64Image: 'JVBERi0xLjQ=',
    fileExt: 'pdf',
    type: 'Bill of Lading',
    ...overrides,
  }
}

describe('southeastern-freight transformLabel', () => {
  it('maps id from pro', () => {
    expect(transformLabel(makeRaw()).id).toBe('PRO-SEFL-001')
  })

  it('maps trackingNumber from pro', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('PRO-SEFL-001')
  })

  it('maps carrierId to southeastern-freight', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('southeastern-freight')
  })

  it('maps format to PDF', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps base64 from base64Image', () => {
    expect(transformLabel(makeRaw()).base64).toBe('JVBERi0xLjQ=')
  })

  it('maps status to CREATED when no error', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps status to VOIDED when error is present', () => {
    expect(transformLabel(makeRaw({ error: 'document not found' })).status).toBe('VOIDED')
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing pro — id and trackingNumber are undefined', () => {
    const r = transformLabel(makeRaw({ pro: undefined }))
    expect(r.id).toBeUndefined()
    expect(r.trackingNumber).toBeUndefined()
  })

  it('produces schema-valid Label', () => {
    expect(() => LabelSchema.parse(transformLabel(makeRaw()))).not.toThrow()
  })
})
