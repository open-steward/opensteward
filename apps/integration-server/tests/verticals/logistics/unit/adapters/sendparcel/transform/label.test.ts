import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type SendParcelLabel,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeLabel(overrides: Partial<SendParcelLabel> = {}): SendParcelLabel {
  return {
    id: 'lbl-001',
    shipmentId: 'shp-001',
    trackingNumber: 'TN0001234',
    carrier: 'dhl',
    service: '38',
    format: 'pdf',
    url: 'https://labels.sendparcel.com/lbl-001.pdf',
    base64: null,
    price: 599,
    currency: 'EUR',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T01:00:00Z',
    ...overrides,
  }
}

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps id, shipmentId, trackingNumber, carrierId', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)
    expect(result.id).toBe('lbl-001')
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('TN0001234')
    expect(result.carrierId).toBe('dhl')
  })

  it('maps pdf format to PDF enum', () => {
    const result = transformLabel(makeLabel({ format: 'pdf' }))
    expect(result.format).toBe('PDF')
  })

  it('maps png format to PNG enum', () => {
    const result = transformLabel(makeLabel({ format: 'png' }))
    expect(result.format).toBe('PNG')
  })

  it('maps zpl format to ZPL enum', () => {
    const result = transformLabel(makeLabel({ format: 'zpl' }))
    expect(result.format).toBe('ZPL')
  })

  it('sets status to CREATED', () => {
    const result = transformLabel(makeLabel())
    expect(result.status).toBe('CREATED')
  })

  it('maps price → cost.amount and currency', () => {
    const result = transformLabel(makeLabel({ price: 599, currency: 'EUR' }))
    expect(result.cost?.amount).toBe(599)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('defaults cost currency to EUR when absent', () => {
    const result = transformLabel(makeLabel({ price: 100, currency: null }))
    expect(result.cost?.currency).toBe('EUR')
  })

  it('omits cost when price is null', () => {
    const result = transformLabel(makeLabel({ price: null }))
    expect(result.cost).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeLabel()))).not.toThrow()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })
})
