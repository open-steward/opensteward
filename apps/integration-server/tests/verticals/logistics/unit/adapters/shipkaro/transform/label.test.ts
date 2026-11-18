import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type ShipKaroLabel,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<ShipKaroLabel> = {}): ShipKaroLabel {
  return {
    id: 101,
    shipment_id: 202,
    awb_code: 'AWB123456',
    carrier_name: 'BlueDart',
    service_code: 'EXPRESS',
    label_url: 'https://labels.example/101.pdf',
    status: 'CREATED',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel', () => {
  it('maps id as string from numeric id', () => {
    expect(transformLabel(makeRaw()).id).toBe('101')
  })

  it('maps shipmentId from shipment_id', () => {
    expect(transformLabel(makeRaw()).shipmentId).toBe('202')
  })

  it('falls back to order_id for shipmentId when shipment_id absent', () => {
    expect(transformLabel(makeRaw({ shipment_id: null, order_id: 303 })).shipmentId).toBe('303')
  })

  it('maps trackingNumber from awb_code', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('AWB123456')
  })

  it('maps carrierId from carrier_name', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('BlueDart')
  })

  it('maps serviceCode', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('EXPRESS')
  })

  it('always emits PDF format', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps status CREATED', () => {
    expect(transformLabel(makeRaw({ status: 'CREATED' })).status).toBe('CREATED')
  })

  it('maps status VOIDED for CANCELLED', () => {
    expect(transformLabel(makeRaw({ status: 'CANCELLED' })).status).toBe('VOIDED')
  })

  it('maps status USED for DELIVERED', () => {
    expect(transformLabel(makeRaw({ status: 'DELIVERED' })).status).toBe('USED')
  })

  it('maps url from label_url', () => {
    expect(transformLabel(makeRaw()).url).toBe('https://labels.example/101.pdf')
  })

  it('falls back to label_pdf for url when label_url absent', () => {
    expect(
      transformLabel(makeRaw({ label_url: null, label_pdf: 'https://labels.example/101-pdf.pdf' }))
        .url,
    ).toBe('https://labels.example/101-pdf.pdf')
  })

  it('maps createdAt as Date', () => {
    expect(transformLabel(makeRaw()).createdAt).toEqual(new Date('2024-03-01T00:00:00Z'))
  })

  it('passes schema validation', () => {
    const result = transformLabel(makeRaw())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('passes metadata through unmodified', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })
})
