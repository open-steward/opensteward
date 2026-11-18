import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type VamashipLabel,
} from '../../../../../../../src/verticals/logistics/adapters/vamaship/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeLabel(overrides: Partial<VamashipLabel> = {}): VamashipLabel {
  return {
    id: 101,
    shipment_id: 55,
    awb_number: 'AWB123456789',
    courier_name: 'Delhivery',
    service_type: 'EXPRESS',
    label_url: 'https://labels.vamaship.com/101.pdf',
    status: 'created',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel (vamaship)', () => {
  it('maps id and shipmentId to strings', () => {
    const result = transformLabel(makeLabel())
    expect(result.id).toBe('101')
    expect(result.shipmentId).toBe('55')
  })

  it('maps trackingNumber from awb_number', () => {
    const result = transformLabel(makeLabel())
    expect(result.trackingNumber).toBe('AWB123456789')
  })

  it('maps carrierId from courier_name', () => {
    const result = transformLabel(makeLabel())
    expect(result.carrierId).toBe('Delhivery')
  })

  it('hardcodes format to PDF', () => {
    const result = transformLabel(makeLabel())
    expect(result.format).toBe('PDF')
  })

  it('hardcodes status to CREATED', () => {
    const result = transformLabel(makeLabel())
    expect(result.status).toBe('CREATED')
  })

  it('maps url from label_url', () => {
    const result = transformLabel(makeLabel())
    expect(result.url).toBe('https://labels.vamaship.com/101.pdf')
  })

  it('maps createdAt as a Date', () => {
    const result = transformLabel(makeLabel())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes metadata through as raw object', () => {
    const raw = makeLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('passes LabelSchema.parse without throwing', () => {
    const result = transformLabel(makeLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('handles all null fields gracefully', () => {
    const raw: VamashipLabel = {
      id: null,
      shipment_id: null,
      awb_number: null,
      courier_name: null,
      service_type: null,
      label_url: null,
      status: null,
      created_at: null,
    }
    const result = transformLabel(raw)
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })
})
