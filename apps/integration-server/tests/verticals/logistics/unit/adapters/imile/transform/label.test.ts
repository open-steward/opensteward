import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type IMileLabel,
} from '../../../../../../../src/verticals/logistics/adapters/imile/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<IMileLabel> = {}): IMileLabel {
  return {
    waybillNo: 'WB-001',
    orderNo: 'ORD-001',
    labelUrl: 'https://labels.imile.example/WB-001.pdf',
    labelBase64: null,
    labelFormat: 'PDF',
    createdTime: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('imile transformLabel', () => {
  it('maps id from waybillNo', () => {
    expect(transformLabel(makeLabel()).id).toBe('WB-001')
  })

  it('maps trackingNumber from waybillNo', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('WB-001')
  })

  it('maps shipmentId from waybillNo', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('WB-001')
  })

  it('sets carrierId to imile', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('imile')
  })

  it('maps url from labelUrl', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://labels.imile.example/WB-001.pdf')
  })

  it('maps format PDF from labelFormat', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('maps format ZPL correctly', () => {
    expect(transformLabel(makeLabel({ labelFormat: 'ZPL' })).format).toBe('ZPL')
  })

  it('defaults format to PDF when labelFormat is null', () => {
    expect(transformLabel(makeLabel({ labelFormat: null })).format).toBe('PDF')
  })

  it('maps status to CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('maps base64 content', () => {
    const result = transformLabel(makeLabel({ labelBase64: 'abc123==' }))
    expect(result.base64).toBe('abc123==')
  })

  it('passes LabelSchema.parse without throwing', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles null waybillNo', () => {
    const result = transformLabel(makeLabel({ waybillNo: null }))
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
  })
})
