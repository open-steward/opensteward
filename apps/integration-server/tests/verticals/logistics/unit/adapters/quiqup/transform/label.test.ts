import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type QuiqupLabel,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<QuiqupLabel> = {}): QuiqupLabel {
  return {
    id: 'lbl-qq-001',
    url: 'https://labels.quiqup.example/lbl-qq-001.pdf',
    format: 'pdf',
    status: 'active',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('Quiqup transformLabel', () => {
  it('maps core fields correctly', () => {
    const result = transformLabel(makeRaw(), 'shp-001', 'TRK123')
    expect(result.id).toBe('lbl-qq-001')
    expect(result.carrierId).toBe('quiqup')
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('TRK123')
    expect(result.url).toBe('https://labels.quiqup.example/lbl-qq-001.pdf')
  })

  it('maps pdf format string to PDF enum', () => {
    const result = transformLabel(makeRaw({ format: 'pdf' }))
    expect(result.format).toBe('PDF')
  })

  it('maps zpl format string to ZPL enum', () => {
    const result = transformLabel(makeRaw({ format: 'zpl' }))
    expect(result.format).toBe('ZPL')
  })

  it('maps png/image format to PNG enum', () => {
    const result = transformLabel(makeRaw({ format: 'image' }))
    expect(result.format).toBe('PNG')
  })

  it('maps epl format to EPL2 enum', () => {
    const result = transformLabel(makeRaw({ format: 'epl' }))
    expect(result.format).toBe('EPL2')
  })

  it('maps unknown format to undefined', () => {
    const result = transformLabel(makeRaw({ format: 'unknown_format' }))
    expect(result.format).toBeUndefined()
  })

  it('maps active status to CREATED', () => {
    const result = transformLabel(makeRaw({ status: 'active' }))
    expect(result.status).toBe('CREATED')
  })

  it('maps voided status to VOIDED', () => {
    const result = transformLabel(makeRaw({ status: 'voided' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps cancelled status to VOIDED', () => {
    const result = transformLabel(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('VOIDED')
  })

  it('maps used/scanned status to USED', () => {
    expect(transformLabel(makeRaw({ status: 'used' })).status).toBe('USED')
    expect(transformLabel(makeRaw({ status: 'scanned' })).status).toBe('USED')
  })

  it('maps refunded status to REFUNDED', () => {
    const result = transformLabel(makeRaw({ status: 'refunded' }))
    expect(result.status).toBe('REFUNDED')
  })

  it('defaults unknown status to CREATED', () => {
    const result = transformLabel(makeRaw({ status: 'whatever' }))
    expect(result.status).toBe('CREATED')
  })

  it('parses ISO date strings into Date objects', () => {
    const result = transformLabel(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema.parse without throwing', () => {
    const result = transformLabel(makeRaw(), 'shp-001', 'TRK123')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('passes schema without optional fields', () => {
    const result = transformLabel({})
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
