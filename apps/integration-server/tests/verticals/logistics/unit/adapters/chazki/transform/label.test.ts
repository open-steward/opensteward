import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ChazkiLabel,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeLabel(overrides: Partial<ChazkiLabel> = {}): ChazkiLabel {
  return {
    id: 'lbl-001',
    shipment_id: 'shp-001',
    tracking_number: 'TRK-001',
    carrier: 'chazki',
    service: 'EXPRESS',
    url: 'https://example.com/label.pdf',
    format: 'application/pdf',
    status: 'created',
    // Use integer minor-unit amount to satisfy Amount (safeint) in MoneySchema.
    amount: 1550,
    currency: 'PEN',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps all core fields correctly', () => {
    const result = transformLabel(makeLabel())

    expect(result.id).toBe('lbl-001')
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('TRK-001')
    expect(result.carrierId).toBe('chazki')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toBe('https://example.com/label.pdf')
    expect(result.cost?.amount).toBe(1550)
    expect(result.cost?.currency).toBe('PEN')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  // ─── Format mapping ──────────────────────────────────────────────────────────

  describe('format mapping', () => {
    it.each([
      ['application/pdf', 'PDF'],
      ['application/zpl', 'ZPL'],
      ['image/png', 'PNG'],
    ] as const)('maps %s → %s', (mimeType, expected) => {
      const result = transformLabel(makeLabel({ format: mimeType }))
      expect(result.format).toBe(expected)
    })

    it('returns undefined format for unknown MIME type', () => {
      const result = transformLabel(makeLabel({ format: 'application/octet-stream' }))
      expect(result.format).toBeUndefined()
    })

    it('returns undefined format when format and file_type are both null', () => {
      const result = transformLabel(makeLabel({ format: null, file_type: null }))
      expect(result.format).toBeUndefined()
    })

    it('uses file_type as format fallback when format is null', () => {
      const result = transformLabel(makeLabel({ format: null, file_type: 'application/zpl' }))
      expect(result.format).toBe('ZPL')
    })
  })

  // ─── Status mapping ──────────────────────────────────────────────────────────

  describe('status mapping', () => {
    it.each([
      ['voided', 'VOIDED'],
      ['refunded', 'REFUNDED'],
      ['used', 'USED'],
      ['created', 'CREATED'],
    ] as const)('maps %s → %s', (rawStatus, expected) => {
      const result = transformLabel(makeLabel({ status: rawStatus }))
      expect(result.status).toBe(expected)
    })

    it('defaults to CREATED for unknown status', () => {
      const result = transformLabel(makeLabel({ status: 'unknown_status' }))
      expect(result.status).toBe('CREATED')
    })

    it('defaults to CREATED when status is null', () => {
      const result = transformLabel(makeLabel({ status: null }))
      expect(result.status).toBe('CREATED')
    })
  })

  // ─── Base64 content ──────────────────────────────────────────────────────────

  it('maps base64 content when format is null', () => {
    const result = transformLabel(makeLabel({ content: 'ABC123', format: null, url: null }))
    expect(result.base64).toBe('ABC123')
    expect(result.format).toBeUndefined()
  })

  it('uses base64 field as fallback to content', () => {
    const result = transformLabel(makeLabel({ content: null, base64: 'BASE64DATA', format: null }))
    expect(result.base64).toBe('BASE64DATA')
  })

  // ─── URL fallback ────────────────────────────────────────────────────────────

  it('falls back to label_url when url is null', () => {
    const result = transformLabel(
      makeLabel({ url: null, label_url: 'https://example.com/fallback.pdf' }),
    )
    expect(result.url).toBe('https://example.com/fallback.pdf')
  })

  // ─── Cost handling ───────────────────────────────────────────────────────────

  it('returns undefined cost when amount is null', () => {
    const result = transformLabel(makeLabel({ amount: null }))
    expect(result.cost).toBeUndefined()
  })

  // ─── Tracking number fallback ────────────────────────────────────────────────

  it('falls back to tracking_code when tracking_number is null', () => {
    const result = transformLabel(makeLabel({ tracking_number: null, tracking_code: 'CODE-XYZ' }))
    expect(result.trackingNumber).toBe('CODE-XYZ')
  })

  // ─── Default carrierId ───────────────────────────────────────────────────────

  it('defaults carrierId to chazki when carrier is null', () => {
    const result = transformLabel(makeLabel({ carrier: null }))
    expect(result.carrierId).toBe('chazki')
  })
})
