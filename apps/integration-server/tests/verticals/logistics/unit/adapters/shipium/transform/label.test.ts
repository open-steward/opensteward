import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  transformLabelFromResponse,
} from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/label'
import type { ShipiumCarrierLabel } from '../../../../../../../src/verticals/logistics/adapters/shipium/transform/shipment'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<ShipiumCarrierLabel> = {}): ShipiumCarrierLabel {
  return {
    shipiumLabelId: 'lbl-abc123',
    status: 'active',
    carrierTrackingId: 'TRACK-001',
    carrierTrackingLink: 'https://carrier.example/track/TRACK-001',
    documents: [
      {
        labelFormat: 'pdf',
        labelUrl: 'https://labels.example/lbl-abc123.pdf',
      },
    ],
    ...overrides,
  }
}

describe('transformLabel', () => {
  it('maps id and trackingNumber', () => {
    const raw = makeRaw()
    const result = transformLabel(raw, 'shp-xyz')

    expect(result.id).toBe('lbl-abc123')
    expect(result.trackingNumber).toBe('TRACK-001')
    expect(result.shipmentId).toBe('shp-xyz')
  })

  it('maps PDF format from document labelFormat', () => {
    const raw = makeRaw()
    const result = transformLabel(raw)
    expect(result.format).toBe('PDF')
  })

  it('maps PNG format from document labelFormat', () => {
    const raw = makeRaw({
      documents: [{ labelFormat: 'png', labelUrl: 'https://labels.example/lbl.png' }],
    })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('maps ZPL format', () => {
    const raw = makeRaw({
      documents: [{ labelFormat: 'zpl', labelUrl: 'https://labels.example/lbl.zpl' }],
    })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('sets status VOIDED for voided raw status', () => {
    const raw = makeRaw({ status: 'voided' })
    expect(transformLabel(raw).status).toBe('VOIDED')
  })

  it('sets status CREATED for non-voided status', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps label URL from documents array', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).url).toBe('https://labels.example/lbl-abc123.pdf')
  })

  it('prefers PDF document over other formats', () => {
    const raw = makeRaw({
      documents: [
        { labelFormat: 'png', labelUrl: 'https://labels.example/lbl.png' },
        { labelFormat: 'pdf', labelUrl: 'https://labels.example/lbl.pdf' },
      ],
    })
    expect(transformLabel(raw).url).toBe('https://labels.example/lbl.pdf')
  })

  it('passes schema validation', () => {
    const result = transformLabel(makeRaw(), 'shp-xyz', new Date('2024-03-01T00:00:00Z'))
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })
})

describe('transformLabelFromResponse', () => {
  it('parses createdAt from ISO string', () => {
    const raw = makeRaw()
    const result = transformLabelFromResponse(raw, 'shp-xyz', '2024-03-01T00:00:00Z')
    expect(result.createdAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('handles null createdAt gracefully', () => {
    const raw = makeRaw()
    const result = transformLabelFromResponse(raw, 'shp-xyz', null)
    expect(result.createdAt).toBeUndefined()
  })
})
