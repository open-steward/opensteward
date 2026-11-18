import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type Parcel2GoQuote,
} from '../../../../../../../src/verticals/logistics/adapters/parcel2go/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeQuote(overrides: Partial<Parcel2GoQuote> = {}): Parcel2GoQuote {
  return {
    Slug: 'evri-parcelshop',
    CourierName: 'Evri',
    ServiceName: 'Evri ParcelShop',
    TotalPrice: 3.49,
    EstimatedDeliveryDate: '2024-03-04T00:00:00Z',
    CollectionType: 'DropOff',
    DropOffProviderCode: 'EVRI',
    IsGuaranteed: false,
    TransitDays: 3,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('parcel2go transformRate', () => {
  it('maps id from Slug', () => {
    expect(transformRate(makeQuote()).id).toBe('evri-parcelshop')
  })

  it('maps carrierId from CourierName', () => {
    expect(transformRate(makeQuote()).carrierId).toBe('Evri')
  })

  it('maps serviceCode from Slug', () => {
    expect(transformRate(makeQuote()).serviceCode).toBe('evri-parcelshop')
  })

  it('maps serviceName from ServiceName', () => {
    expect(transformRate(makeQuote()).serviceName).toBe('Evri ParcelShop')
  })

  it('sets currency to GBP always', () => {
    expect(transformRate(makeQuote()).currency).toBe('GBP')
  })

  it('maps totalAmount from TotalPrice', () => {
    expect(transformRate(makeQuote()).totalAmount).toBe(3.49)
  })

  it('maps transitDays from TransitDays', () => {
    expect(transformRate(makeQuote()).transitDays).toBe(3)
  })

  it('maps deliveryDays from TransitDays', () => {
    expect(transformRate(makeQuote()).deliveryDays).toBe(3)
  })

  it('maps isGuaranteedDelivery from IsGuaranteed', () => {
    expect(transformRate(makeQuote()).isGuaranteedDelivery).toBe(false)
  })

  it('parses EstimatedDeliveryDate as a Date', () => {
    expect(transformRate(makeQuote()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('omits estimatedDeliveryAt when EstimatedDeliveryDate is null', () => {
    expect(
      transformRate(makeQuote({ EstimatedDeliveryDate: null })).estimatedDeliveryAt,
    ).toBeUndefined()
  })

  it('passes metadata as raw object', () => {
    const raw = makeQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('throws on RateSchema validation because transformRate emits a float totalAmount but RateSchema.totalAmount uses Amount (integer minor-units)', () => {
    // Source bug: parcel2go passes TotalPrice as a float (e.g. 3.49 GBP) directly to
    // totalAmount, but Amount requires a safe integer (minor-unit pence).
    expect(() => RateSchema.parse(transformRate(makeQuote()))).toThrow()
  })
})
