import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type TopshipLabel,
} from '../../../../../../../src/verticals/logistics/adapters/topship/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<TopshipLabel> = {}): TopshipLabel {
  return {
    shipment_id: 'shp-topship-001',
    tracking_number: 'TTRK001',
    label_url: 'https://labels.topship.africa/shp-001.pdf',
    carrier: 'dhl',
    service_code: 'DHL_EXPRESS',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('topship transformLabel', () => {
  it('maps shipment_id → id when no explicit shipmentId arg', () => {
    const r = transformLabel(makeLabel())
    expect(r.id).toBe('shp-topship-001')
  })

  it('explicit shipmentId arg wins over raw.shipment_id for shipmentId', () => {
    const r = transformLabel(makeLabel(), 'explicit-id')
    expect(r.shipmentId).toBe('explicit-id')
  })

  it('uses explicit trackingNumber arg over raw field', () => {
    const r = transformLabel(makeLabel(), undefined, 'EXPLICIT-TRK')
    expect(r.trackingNumber).toBe('EXPLICIT-TRK')
  })

  it('falls back to raw tracking_number when no arg', () => {
    const r = transformLabel(makeLabel())
    expect(r.trackingNumber).toBe('TTRK001')
  })

  it('maps carrier arg → carrierId', () => {
    const r = transformLabel(makeLabel(), undefined, undefined, 'ups')
    expect(r.carrierId).toBe('ups')
  })

  it('falls back to raw.carrier → carrierId', () => {
    const r = transformLabel(makeLabel())
    expect(r.carrierId).toBe('dhl')
  })

  it('sets format to PDF and status to CREATED', () => {
    const r = transformLabel(makeLabel())
    expect(r.format).toBe('PDF')
    expect(r.status).toBe('CREATED')
  })

  it('maps label_url → url', () => {
    const r = transformLabel(makeLabel())
    expect(r.url).toBe('https://labels.topship.africa/shp-001.pdf')
  })

  it('maps created_at → createdAt as Date', () => {
    const r = transformLabel(makeLabel())
    expect(r.createdAt).toBeInstanceOf(Date)
  })

  it('metadata references the raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema validation', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
