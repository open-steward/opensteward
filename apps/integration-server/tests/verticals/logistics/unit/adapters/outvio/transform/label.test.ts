import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type OutvioLabel,
} from '../../../../../../../src/verticals/logistics/adapters/outvio/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

// NOTE: LabelSchema.cost uses MoneySchema where amount is z.number().int() (minor units).
// transformLabel calls parseDecimal(raw.cost) which returns the number as-is.
// Using an integer value (e.g. 1250) in raw.cost ensures schema parse passes.

function makeRawLabel(overrides: Partial<OutvioLabel> = {}): OutvioLabel {
  return {
    id: 'lbl-001',
    shipmentId: 'shp-001',
    trackingNumber: 'OV1234567890ES',
    carrierId: 'correos',
    serviceCode: 'PAQPREMIUM',
    format: 'pdf',
    status: 'active',
    url: 'https://labels.outvio.com/lbl-001.pdf',
    cost: 1250,
    currency: 'EUR',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformLabel', () => {
  it('maps canonical fields', () => {
    const raw = makeRawLabel()
    const result = transformLabel(raw)

    expect(result.id).toBe('lbl-001')
    expect(result.shipmentId).toBe('shp-001')
    expect(result.trackingNumber).toBe('OV1234567890ES')
    expect(result.carrierId).toBe('correos')
    expect(result.serviceCode).toBe('PAQPREMIUM')
    expect(result.format).toBe('PDF')
    expect(result.status).toBe('CREATED')
    expect(result.url).toBe('https://labels.outvio.com/lbl-001.pdf')
  })

  it('maps cost with amount and currency', () => {
    const raw = makeRawLabel()
    const result = transformLabel(raw)
    expect(result.cost?.amount).toBe(1250)
    expect(result.cost?.currency).toBe('EUR')
  })

  it('maps createdAt and updatedAt to Date objects', () => {
    const raw = makeRawLabel()
    const result = transformLabel(raw)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes schema validation for a well-formed label', () => {
    const result = transformLabel(makeRawLabel())
    expect(() => LabelSchema.parse(result)).not.toThrow()
  })

  it('maps snake_case fields when camelCase is absent', () => {
    const raw: OutvioLabel = {
      shipment_id: 'shp-snake',
      tracking_number: 'TRK-SNAKE',
      carrier_id: 'ups',
      service_code: 'UPS_GND',
      file_type: 'zpl',
      status: 'used',
      label_url: 'https://labels.example.com/lbl.zpl',
      cost: 500,
      currency: 'EUR',
    }
    const result = transformLabel(raw)
    expect(result.shipmentId).toBe('shp-snake')
    expect(result.trackingNumber).toBe('TRK-SNAKE')
    expect(result.carrierId).toBe('ups')
    expect(result.serviceCode).toBe('UPS_GND')
    expect(result.format).toBe('ZPL')
    expect(result.status).toBe('USED')
    expect(result.url).toBe('https://labels.example.com/lbl.zpl')
  })

  it('maps all label formats correctly', () => {
    const cases: [string, string][] = [
      ['pdf', 'PDF'],
      ['application/pdf', 'PDF'],
      ['png', 'PNG'],
      ['image/png', 'PNG'],
      ['zpl', 'ZPL'],
      ['epl', 'EPL2'],
    ]
    for (const [fmt, expected] of cases) {
      const result = transformLabel(makeRawLabel({ format: fmt }))
      expect(result.format).toBe(expected)
    }
  })

  it('maps all label statuses correctly', () => {
    const cases: [string, string][] = [
      ['created', 'CREATED'],
      ['active', 'CREATED'],
      ['used', 'USED'],
      ['printed', 'USED'],
      ['refunded', 'REFUNDED'],
      ['voided', 'VOIDED'],
      ['cancelled', 'VOIDED'],
      ['canceled', 'VOIDED'],
    ]
    for (const [status, expected] of cases) {
      expect(transformLabel(makeRawLabel({ status })).status).toBe(expected)
    }
  })

  it('defaults status to CREATED for unknown status strings', () => {
    const result = transformLabel(makeRawLabel({ status: 'something-unknown' }))
    expect(result.status).toBe('CREATED')
  })

  it('defaults currency to EUR when not provided', () => {
    const raw = makeRawLabel({ currency: undefined, cost: 999 })
    expect(transformLabel(raw).cost?.currency).toBe('EUR')
  })

  it('omits cost when raw.cost is null', () => {
    const result = transformLabel(makeRawLabel({ cost: null }))
    expect(result.cost).toBeUndefined()
  })

  it('passes through metadata as the raw object', () => {
    const raw = makeRawLabel()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: OutvioLabel = { status: 'created' }
    const result = transformLabel(raw)
    expect(result.id).toBeUndefined()
    expect(result.trackingNumber).toBeUndefined()
    expect(result.url).toBeUndefined()
    expect(result.cost).toBeUndefined()
  })
})
