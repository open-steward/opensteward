import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type GophrUkLabelResponse,
} from '../../../../../../../src/verticals/logistics/adapters/gophr-uk/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<GophrUkLabelResponse> = {}): GophrUkLabelResponse {
  return {
    label_url: 'https://api.gophr.com/labels/delivery-abc123.pdf',
    delivery_id: 'delivery-abc123',
    job_id: 'job-xyz789',
    tracking_number: 'GUKTRK001',
    created_time: '2024-03-01T09:00:00Z',
    ...overrides,
  }
}

describe('Gophr UK transformLabel', () => {
  it('maps id from delivery_id', () => {
    expect(transformLabel(makeLabel()).id).toBe('delivery-abc123')
  })

  it('maps shipmentId from job_id', () => {
    expect(transformLabel(makeLabel()).shipmentId).toBe('job-xyz789')
  })

  it('uses injected jobId when job_id is missing', () => {
    expect(transformLabel(makeLabel({ job_id: null }), 'injected-job').shipmentId).toBe(
      'injected-job',
    )
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformLabel(makeLabel()).trackingNumber).toBe('GUKTRK001')
  })

  it('sets carrierId to gophr-uk', () => {
    expect(transformLabel(makeLabel()).carrierId).toBe('gophr-uk')
  })

  it('sets serviceCode to gophr-uk', () => {
    expect(transformLabel(makeLabel()).serviceCode).toBe('gophr-uk')
  })

  it('sets format to PDF', () => {
    expect(transformLabel(makeLabel()).format).toBe('PDF')
  })

  it('sets status to CREATED', () => {
    expect(transformLabel(makeLabel()).status).toBe('CREATED')
  })

  it('maps url from label_url', () => {
    expect(transformLabel(makeLabel()).url).toBe('https://api.gophr.com/labels/delivery-abc123.pdf')
  })

  it('maps createdAt from created_time', () => {
    expect(transformLabel(makeLabel()).createdAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformLabel({})
    expect(result.id).toBeUndefined()
    expect(result.shipmentId).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
  })

  it('produces output that parses against LabelSchema', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
