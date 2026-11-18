import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type WebshipperLabel,
} from '../../../../../../../src/verticals/logistics/adapters/webshipper/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<WebshipperLabel> = {}): WebshipperLabel {
  return {
    id: 101,
    type: 'labels',
    attributes: {
      shipment_id: 'shp-99',
      tracking_number: 'TRK-WS-001',
      service_code: 'express',
      label_size: 'A4',
      label_format: 'pdf',
      base64: 'JVBERi0xLjQ=',
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-01T06:00:00Z',
    },
    ...overrides,
  }
}

describe('transformLabel (webshipper)', () => {
  it('maps id to string from raw.id', () => {
    expect(transformLabel(makeRaw()).id).toBe('101')
  })

  it('maps shipmentId from attributes.shipment_id', () => {
    expect(transformLabel(makeRaw()).shipmentId).toBe('shp-99')
  })

  it('maps trackingNumber from attributes.tracking_number', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('TRK-WS-001')
  })

  it('sets carrierId to webshipper', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('webshipper')
  })

  it('maps serviceCode from attributes.service_code', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('express')
  })

  it('maps format pdf → PDF', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps format PNG from png', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, label_format: 'png' },
    })
    expect(transformLabel(raw).format).toBe('PNG')
  })

  it('maps format ZPL', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, label_format: 'zpl' },
    })
    expect(transformLabel(raw).format).toBe('ZPL')
  })

  it('maps format EPL2 from epl', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, label_format: 'epl' },
    })
    expect(transformLabel(raw).format).toBe('EPL2')
  })

  it('sets format undefined for unknown format', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, label_format: 'unknown_fmt' },
    })
    expect(transformLabel(raw).format).toBeUndefined()
  })

  it('sets status to CREATED', () => {
    expect(transformLabel(makeRaw()).status).toBe('CREATED')
  })

  it('maps base64 string directly', () => {
    expect(transformLabel(makeRaw()).base64).toBe('JVBERi0xLjQ=')
  })

  it('takes first element when base64 is an array', () => {
    const raw = makeRaw({
      attributes: { ...makeRaw().attributes, base64: ['first-label', 'second-label'] },
    })
    expect(transformLabel(raw).base64).toBe('first-label')
  })

  it('sets base64 undefined when base64 is null', () => {
    const raw = makeRaw({ attributes: { ...makeRaw().attributes, base64: null } })
    expect(transformLabel(raw).base64).toBeUndefined()
  })

  it('maps createdAt from attributes.created_at', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('maps updatedAt from attributes.updated_at', () => {
    expect(transformLabel(makeRaw()).updatedAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('produces output that parses against LabelSchema', () => {
    expect(() => LabelSchema.parse(transformLabel(makeRaw()))).not.toThrow()
  })
})
