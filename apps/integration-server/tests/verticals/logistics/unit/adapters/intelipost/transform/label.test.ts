import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type IntelipostLabelRaw,
} from '../../../../../../../src/verticals/logistics/adapters/intelipost/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<IntelipostLabelRaw> = {}): IntelipostLabelRaw {
  return {
    order_number: 'ORD-001',
    shipment_order_volume_number: 1,
    label_url: 'https://example.com/label.pdf',
    ...overrides,
  }
}

describe('intelipost transformLabel', () => {
  it('builds composite id from order_number and volume_number', () => {
    const result = transformLabel(makeRaw())
    expect(result.id).toBe('ORD-001:1')
  })

  it('maps label_url to url', () => {
    const result = transformLabel(makeRaw())
    expect(result.url).toBe('https://example.com/label.pdf')
  })

  it('sets shipmentId to order_number', () => {
    const result = transformLabel(makeRaw())
    expect(result.shipmentId).toBe('ORD-001')
  })

  it('always sets format to PDF and status to CREATED', () => {
    const result = transformLabel(makeRaw())
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
  })

  it('passes schema validation', () => {
    expect(() => LabelSchema.parse(transformLabel(makeRaw()))).not.toThrow()
  })

  it('falls back to order_number as id when volume_number is null', () => {
    const result = transformLabel(makeRaw({ shipment_order_volume_number: null }))
    expect(result.id).toBe('ORD-001')
  })

  it('id is undefined when both order_number and volume_number are null', () => {
    const result = transformLabel(
      makeRaw({ order_number: null, shipment_order_volume_number: null }),
    )
    expect(result.id).toBeUndefined()
  })

  it('url is undefined when label_url is null', () => {
    const result = transformLabel(makeRaw({ label_url: null }))
    expect(result.url).toBeUndefined()
  })
})
