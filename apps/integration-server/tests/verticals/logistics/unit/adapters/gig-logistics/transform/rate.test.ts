import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type GigRate,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<GigRate> = {}): GigRate {
  return {
    id: 'rate-001',
    serviceCode: 'EXPRESS',
    serviceName: 'GIG Express',
    carrier: 'gig-logistics',
    currency: 'NGN',
    price: 1200,
    totalPrice: 1500,
    transitDays: 2,
    estimatedDeliveryDate: '2024-03-03T00:00:00Z',
    isGuaranteed: true,
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('gig-logistics transformRate', () => {
  it('maps id', () => {
    expect(transformRate(makeRate()).id).toBe('rate-001')
  })

  it('maps carrier as carrierId', () => {
    expect(transformRate(makeRate()).carrierId).toBe('gig-logistics')
  })

  it('falls back carrierId to "gig-logistics" when carrier is null', () => {
    expect(transformRate(makeRate({ carrier: null })).carrierId).toBe('gig-logistics')
  })

  it('maps serviceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('EXPRESS')
  })

  it('maps serviceName', () => {
    expect(transformRate(makeRate()).serviceName).toBe('GIG Express')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('NGN')
  })

  it('uses GIG_DEFAULT_CURRENCY (NGN) when currency is null', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('NGN')
  })

  it('prefers totalPrice over price for totalAmount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(1500)
  })

  it('falls back to price when totalPrice is null', () => {
    expect(transformRate(makeRate({ totalPrice: null })).totalAmount).toBe(1200)
  })

  it('maps transitDays and deliveryDays', () => {
    const result = transformRate(makeRate())
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
  })

  it('maps estimatedDeliveryDate as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteed as isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(true)
  })

  it('maps createdAt as Date', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('handles null price and totalPrice gracefully', () => {
    const result = transformRate(makeRate({ price: null, totalPrice: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes RateSchema validation', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
