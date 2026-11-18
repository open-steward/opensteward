import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type Parcel2GoLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLabelResponse(
  overrides: Partial<Parcel2GoLabelResponse> = {},
): Parcel2GoLabelResponse {
  return {
    Base64EncodedLabels: ['JVBERi0xLjQK'],
    OrderLineId: 'OL-001',
    GeneratedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcel2go transformLabel', () => {
  it('maps id from OrderLineId', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').id).toBe('OL-001')
  })

  it('falls back id to orderId when OrderLineId is null', () => {
    expect(transformLabel(makeLabelResponse({ OrderLineId: null }), 'ord-001').id).toBe('ord-001')
  })

  it('maps shipmentId from orderId argument', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').shipmentId).toBe('ord-001')
  })

  it('maps trackingNumber from optional argument', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001', 'TRK-123').trackingNumber).toBe('TRK-123')
  })

  it('maps carrierId from optional argument', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001', undefined, 'evri').carrierId).toBe('evri')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').format).toBe('PDF')
  })

  it('sets status to CREATED', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').status).toBe('CREATED')
  })

  it('maps base64 from first element of Base64EncodedLabels', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').base64).toBe('JVBERi0xLjQK')
  })

  it('omits base64 when Base64EncodedLabels is null', () => {
    expect(
      transformLabel(makeLabelResponse({ Base64EncodedLabels: null }), 'ord-001').base64,
    ).toBeUndefined()
  })

  it('parses GeneratedAt as a Date', () => {
    expect(transformLabel(makeLabelResponse(), 'ord-001').createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as raw object', () => {
    const raw = makeLabelResponse()
    expect(transformLabel(raw, 'ord-001').metadata).toBe(raw)
  })

  it('passes LabelSchema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabelResponse(), 'ord-001'))).not.toThrow()
  })
})
