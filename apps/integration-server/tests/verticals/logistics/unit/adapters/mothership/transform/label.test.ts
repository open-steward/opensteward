import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  unwrapDocuments,
  type MothershipDocumentRaw,
  type MothershipDocumentListResponse,
} from '../../../../../../../src/verticals/logistics/adapters/mothership/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeDoc(overrides: Partial<MothershipDocumentRaw> = {}): MothershipDocumentRaw {
  return {
    type: 'BillOfLading',
    url: 'https://api.mothership.com/documents/bol-123.pdf',
    expiresAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (mothership)', () => {
  it('derives id from type and shipmentId', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').id).toBe('shp-abc_BillOfLading')
  })

  it('falls back to shipmentId as id when type is absent', () => {
    expect(transformLabel(makeDoc({ type: undefined }), 'shp-abc').id).toBe('shp-abc')
  })

  it('maps shipmentId', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').shipmentId).toBe('shp-abc')
  })

  it('maps carrierId to "mothership"', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').carrierId).toBe('mothership')
  })

  it('maps format to "PDF"', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').format).toBe('PDF')
  })

  it('maps status to "CREATED"', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').status).toBe('CREATED')
  })

  it('maps url', () => {
    expect(transformLabel(makeDoc(), 'shp-abc').url).toBe(
      'https://api.mothership.com/documents/bol-123.pdf',
    )
  })

  it('maps createdAt from expiresAt field', () => {
    // Source uses expiresAt as the closest available timestamp
    expect(transformLabel(makeDoc(), 'shp-abc').createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeDoc()
    expect(transformLabel(raw, 'shp-abc').metadata).toBe(raw)
  })

  it('produces a LabelSchema-valid result', () => {
    expect(() => LabelSchema.parse(transformLabel(makeDoc(), 'shp-abc'))).not.toThrow()
  })
})

describe('unwrapDocuments (mothership)', () => {
  it('unwraps from data array', () => {
    const res: MothershipDocumentListResponse = {
      data: [makeDoc(), makeDoc({ type: 'ProofOfDelivery' })],
    }
    expect(unwrapDocuments(res)).toHaveLength(2)
  })

  it('returns empty array when data is absent', () => {
    expect(unwrapDocuments({})).toEqual([])
  })
})
