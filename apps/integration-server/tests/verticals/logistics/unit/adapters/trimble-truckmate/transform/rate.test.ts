import { describe, it, expect } from 'vitest'
import {
  transformRate,
  extractRates,
  type TrimbleTruckmateRateResponse,
  type TrimbleTruckmateRatesResponse,
} from '../../../../../../../src/verticals/logistics/adapters/trimble-truckmate/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(
  overrides: Partial<TrimbleTruckmateRateResponse> = {},
): TrimbleTruckmateRateResponse {
  return {
    quoteId: 'Q-TM-001',
    serviceCode: 'FTL',
    serviceName: 'Full Truckload',
    totalPrice: 3500,
    currency: 'USD',
    estimatedPickupDate: '2024-03-01T00:00:00Z',
    estimatedDeliveryDate: '2024-03-04T00:00:00Z',
    transitDays: 3,
    isGuaranteed: true,
    ...overrides,
  }
}

describe('trimble-truckmate transformRate', () => {
  it('maps id from quoteId', () => {
    expect(transformRate(makeRate()).id).toBe('Q-TM-001')
  })

  it('maps carrierId to trimble-truckmate', () => {
    expect(transformRate(makeRate()).carrierId).toBe('trimble-truckmate')
  })

  it('maps serviceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('FTL')
  })

  it('maps serviceName', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Full Truckload')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('converts totalPrice to minor units (cents)', () => {
    // 3500 dollars → 350000 cents
    expect(transformRate(makeRate()).totalAmount).toBe(350000)
  })

  it('maps transitDays', () => {
    expect(transformRate(makeRate()).transitDays).toBe(3)
  })

  it('maps isGuaranteed to isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(true)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps createdAt from estimatedPickupDate', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('defaults currency to USD when absent', () => {
    expect(transformRate(makeRate({ currency: undefined })).currency).toBe('USD')
  })

  it('falls back id to rateId', () => {
    expect(transformRate(makeRate({ quoteId: undefined, rateId: 'R-001' })).id).toBe('R-001')
  })

  it('falls back serviceCode to serviceType', () => {
    expect(
      transformRate(makeRate({ serviceCode: undefined, serviceType: 'LTL' })).serviceCode,
    ).toBe('LTL')
  })

  it('falls back transitDays to deliveryDays', () => {
    expect(transformRate(makeRate({ transitDays: undefined, deliveryDays: 2 })).transitDays).toBe(2)
  })

  it('passes metadata through', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})

describe('trimble-truckmate extractRates', () => {
  it('extracts from quotes array', () => {
    const raw: TrimbleTruckmateRatesResponse = { quotes: [makeRate()] }
    expect(extractRates(raw)).toHaveLength(1)
  })

  it('falls back to rates array', () => {
    const raw: TrimbleTruckmateRatesResponse = { rates: [makeRate(), makeRate()] }
    expect(extractRates(raw)).toHaveLength(2)
  })

  it('returns empty array when neither is present', () => {
    expect(extractRates({})).toHaveLength(0)
  })
})
