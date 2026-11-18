import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ClickPostLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/clickpost/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

describe('clickpost transformLabel', () => {
  it('maps URL label correctly', () => {
    const raw: ClickPostLabelResponse = {
      waybill: 'AWB-001',
      cp_id: 42,
      label: 'https://example.com/label.pdf',
    }
    const r = transformLabel(raw)
    expect(r.id).toBe('AWB-001')
    expect(r.trackingNumber).toBe('AWB-001')
    expect(r.carrierId).toBe('42')
    expect(r.format).toBe('PDF')
    expect(r.status).toBe('CREATED')
    expect(r.url).toBe('https://example.com/label.pdf')
    expect(r.base64).toBeUndefined()
  })

  it('maps base64 label correctly', () => {
    const raw: ClickPostLabelResponse = {
      waybill: 'AWB-001',
      cp_id: 42,
      label: 'JVBERi0xLjQK...',
    }
    const r = transformLabel(raw)
    expect(r.url).toBeUndefined()
    expect(r.base64).toBe('JVBERi0xLjQK...')
  })

  it('sets shipmentId from waybill', () => {
    const raw: ClickPostLabelResponse = {
      waybill: 'AWB-001',
      cp_id: 42,
      label: 'https://example.com/label.pdf',
    }
    expect(transformLabel(raw).shipmentId).toBe('AWB-001')
  })

  it('sets carrierId to undefined when cp_id is null', () => {
    const raw: ClickPostLabelResponse = {
      waybill: 'AWB-001',
      cp_id: null,
      label: 'https://example.com/label.pdf',
    }
    expect(transformLabel(raw).carrierId).toBeUndefined()
  })

  it('sets url and base64 to undefined when label is null', () => {
    const raw: ClickPostLabelResponse = { waybill: 'AWB-001', cp_id: 42, label: null }
    const r = transformLabel(raw)
    expect(r.url).toBeUndefined()
    expect(r.base64).toBeUndefined()
  })

  it('passes LabelSchema.parse without throwing', () => {
    const raw: ClickPostLabelResponse = {
      waybill: 'AWB-001',
      cp_id: 42,
      label: 'https://example.com/label.pdf',
    }
    expect(() => LabelSchema.parse(transformLabel(raw))).not.toThrow()
  })
})
