import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type NShiftLabel,
} from '../../../../../../../src/verticals/logistics/adapters/nshift/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// ─── Factory ─────────────────────────────────────────────────────────────────

function makeLabel(overrides: Partial<NShiftLabel> = {}): NShiftLabel {
  return {
    id: 'lbl-001',
    shipmentId: 'shp-001',
    parcelNo: '370000000001',
    serviceId: 'DHL_PARCEL',
    format: 'pdf',
    href: 'https://api.nshift.com/labels/lbl-001.pdf',
    description: 'Shipping label for DHL Parcel',
    pdf: null,
    created: '2024-03-01T00:00:00Z',
    updated: '2024-03-02T08:00:00Z',
    ...overrides,
  }
}

// ─── transformLabel ───────────────────────────────────────────────────────────

describe('transformLabel', () => {
  it('maps id and shipmentId from raw label', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)

    expect(result.id).toBe('lbl-001')
    expect(result.shipmentId).toBe('shp-001')
  })

  it('uses parcelNo as id when id is null', () => {
    const raw = makeLabel({ id: null })
    const result = transformLabel(raw)

    expect(result.id).toBe('370000000001')
  })

  it('maps parcelNo to trackingNumber', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).trackingNumber).toBe('370000000001')
  })

  it('sets carrierId to nshift', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).carrierId).toBe('nshift')
  })

  it('maps serviceId to serviceCode', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).serviceCode).toBe('DHL_PARCEL')
  })

  it('maps PDF format correctly', () => {
    const raw = makeLabel({ format: 'pdf' })
    expect(transformLabel(raw).format).toBe('PDF')
  })

  it('maps ZPL format correctly', () => {
    const raw = makeLabel({ format: 'ZPL' })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('maps EPL format to EPL2', () => {
    const raw = makeLabel({ format: 'EPL' })
    expect(transformLabel(raw).format).toBe('EPL2')
  })

  it('maps PNG format correctly', () => {
    const raw = makeLabel({ format: 'png' })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('maps IMAGE format to PNG', () => {
    const raw = makeLabel({ format: 'IMAGE' })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('maps href to url', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).url).toBe('https://api.nshift.com/labels/lbl-001.pdf')
  })

  it('sets status to CREATED', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).status).toBe('CREATED')
  })

  it('maps pdf base64 to base64 field', () => {
    const raw = makeLabel({ pdf: 'JVBERi0xLjQK...' })
    expect(transformLabel(raw).base64).toBe('JVBERi0xLjQK...')
  })

  it('parses created and updated as Date instances', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes raw label as metadata', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('falls back to ZPL format from href when format is null', () => {
    const raw = makeLabel({
      format: null,
      href: 'https://api.nshift.com/labels/lbl-001.zpl',
    })
    // href ends with .zpl → format 'ZPL' is passed to mapFormat → returns 'ZPL'
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('passes LabelSchema.parse without throwing', () => {
    const raw = makeLabel()
    const result = transformLabel(raw)

    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
