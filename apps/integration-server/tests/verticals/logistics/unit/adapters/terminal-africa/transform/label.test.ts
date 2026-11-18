import { describe, it, expect } from 'vitest'
import { transformLabel } from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/label'
import type { TerminalAfricaShipment } from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeShipment(overrides: Partial<TerminalAfricaShipment> = {}): TerminalAfricaShipment {
  return {
    shipment_id: 'shp-001',
    id: 'shp-001',
    carrier_slug: 'dhl',
    carrier_tracking_number: 'TRK999',
    tracking_number: 'TRK-fallback',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('terminal-africa transformLabel', () => {
  it('maps shipment_id → id and shipmentId', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.id).toBe('shp-001')
    expect(r.shipmentId).toBe('shp-001')
  })

  it('prefers carrier_tracking_number for trackingNumber', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.trackingNumber).toBe('TRK999')
  })

  it('falls back to tracking_number when carrier_tracking_number absent', () => {
    const r = transformLabel(
      makeShipment({ carrier_tracking_number: null }),
      'https://example.com/label.pdf',
    )
    expect(r.trackingNumber).toBe('TRK-fallback')
  })

  it('falls back to extras.tracking_number when both tracking fields are absent', () => {
    const r = transformLabel(
      makeShipment({
        carrier_tracking_number: null,
        tracking_number: null,
        extras: { tracking_number: 'TRK-extras' },
      }),
      'https://example.com/label.pdf',
    )
    expect(r.trackingNumber).toBe('TRK-extras')
  })

  it('maps carrier_slug → carrierId', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.carrierId).toBe('dhl')
  })

  it('sets format to PDF and status to CREATED', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.format).toBe('PDF')
    expect(r.status).toBe('CREATED')
  })

  it('uses provided labelUrl for url', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.url).toBe('https://example.com/label.pdf')
  })

  it('maps created_at → createdAt as Date', () => {
    const r = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeShipment(), 'https://example.com/label.pdf')
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles null shipment_id by falling back to id', () => {
    const r = transformLabel(
      makeShipment({ shipment_id: null, id: 'shp-fallback' }),
      'https://example.com/label.pdf',
    )
    expect(r.id).toBe('shp-fallback')
  })
})
