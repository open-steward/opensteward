import { describe, it, expect } from 'vitest'
import {
  transformLabel,
  type StarshipitLabel,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/label'
import { LabelSchema } from '../../../../../../../src/verticals/logistics/schema/label'

function makeRaw(overrides: Partial<StarshipitLabel> = {}): StarshipitLabel {
  return {
    order_id: 12345,
    order_number: 'ORD-001',
    tracking_number: 'AP123456789AU',
    carrier_name: 'Australia Post',
    carrier_code: 'auspost',
    service_name: 'Parcel Post',
    service_code: 'AP_PARCEL',
    label_url: null,
    label_format: 'pdf',
    label_data: 'JVBERi0xLjQ=',
    status: 'created',
    shipping_price: 12.5,
    currency: 'AUD',
    created_date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('starshipit transformLabel', () => {
  it('maps id from order_id (numeric → string)', () => {
    expect(transformLabel(makeRaw()).id).toBe('12345')
  })

  it('maps shipmentId from order_id', () => {
    expect(transformLabel(makeRaw()).shipmentId).toBe('12345')
  })

  it('maps trackingNumber', () => {
    expect(transformLabel(makeRaw()).trackingNumber).toBe('AP123456789AU')
  })

  it('maps carrierId from carrier_code', () => {
    expect(transformLabel(makeRaw()).carrierId).toBe('auspost')
  })

  it('falls back carrierId to carrier_name when carrier_code is null', () => {
    expect(transformLabel(makeRaw({ carrier_code: null })).carrierId).toBe('Australia Post')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformLabel(makeRaw()).serviceCode).toBe('AP_PARCEL')
  })

  it('maps format PDF from label_format "pdf"', () => {
    expect(transformLabel(makeRaw()).format).toBe('PDF')
  })

  it('maps format PNG from label_format "png"', () => {
    expect(transformLabel(makeRaw({ label_format: 'png' })).format).toBe('PNG')
  })

  it('maps format ZPL from label_format "zpl"', () => {
    expect(transformLabel(makeRaw({ label_format: 'zpl' })).format).toBe('ZPL')
  })

  it('maps status CREATED', () => {
    expect(transformLabel(makeRaw({ status: 'created' })).status).toBe('CREATED')
    expect(transformLabel(makeRaw({ status: 'printed' })).status).toBe('CREATED')
    expect(transformLabel(makeRaw({ status: 'ready' })).status).toBe('CREATED')
  })

  it('maps status USED', () => {
    expect(transformLabel(makeRaw({ status: 'shipped' })).status).toBe('USED')
  })

  it('maps status VOIDED', () => {
    expect(transformLabel(makeRaw({ status: 'voided' })).status).toBe('VOIDED')
    expect(transformLabel(makeRaw({ status: 'cancelled' })).status).toBe('VOIDED')
  })

  it('maps status REFUNDED', () => {
    expect(transformLabel(makeRaw({ status: 'refunded' })).status).toBe('REFUNDED')
  })

  it('maps base64 from label_data', () => {
    expect(transformLabel(makeRaw()).base64).toBe('JVBERi0xLjQ=')
  })

  it('maps cost amount and currency', () => {
    const r = transformLabel(makeRaw())
    expect(r.cost?.amount).toBe(12.5)
    expect(r.cost?.currency).toBe('AUD')
  })

  it('defaults cost currency to AUD when null', () => {
    const r = transformLabel(makeRaw({ currency: null }))
    expect(r.cost?.currency).toBe('AUD')
  })

  it('omits cost when shipping_price is null', () => {
    expect(transformLabel(makeRaw({ shipping_price: null })).cost).toBeUndefined()
  })

  it('maps createdAt from created_date', () => {
    expect(transformLabel(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('preserves metadata', () => {
    const raw = makeRaw()
    expect(transformLabel(raw).metadata).toBe(raw)
  })

  it('does NOT parse as schema-valid Label — cost.amount is a float but Amount schema requires int (minor-units)', () => {
    // The transform emits decimal shipping_price (e.g. 12.5) as cost.amount, while
    // MoneySchema.amount uses Amount which requires a safe integer (minor-units).
    // This is a known schema incompatibility in the source transform.
    expect(() => LabelSchema.parse(transformLabel(makeRaw()))).toThrow()
  })
})
