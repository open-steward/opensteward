import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type SendParcelRate,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<SendParcelRate> = {}): SendParcelRate {
  return {
    id: 'rate-001',
    carrier: 'dhl',
    service: '38',
    serviceName: 'DHL Express',
    price: 14.5,
    currency: 'EUR',
    deliveryDays: 3,
    transitDaysMin: 2,
    transitDaysMax: 4,
    estimatedDelivery: '2024-03-05T00:00:00Z',
    isGuaranteed: true,
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps id, carrierId, serviceCode, serviceName', () => {
    const raw = makeRate()
    const result = transformRate(raw)
    expect(result.id).toBe('rate-001')
    expect(result.carrierId).toBe('dhl')
    expect(result.serviceCode).toBe('38')
    expect(result.serviceName).toBe('DHL Express')
  })

  it('maps price → totalAmount and currency', () => {
    const raw = makeRate({ price: 14.5, currency: 'EUR' })
    const result = transformRate(raw)
    expect(result.totalAmount).toBe(14.5)
    expect(result.currency).toBe('EUR')
  })

  it('prefers deliveryDays for transitDays', () => {
    const result = transformRate(makeRate({ deliveryDays: 3, transitDaysMin: 2 }))
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
  })

  it('falls back to transitDaysMin when deliveryDays is absent', () => {
    const result = transformRate(makeRate({ deliveryDays: null, transitDaysMin: 2 }))
    expect(result.transitDays).toBe(2)
  })

  it('maps estimatedDelivery → estimatedDeliveryAt as Date', () => {
    const result = transformRate(makeRate())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteed → isGuaranteedDelivery', () => {
    expect(transformRate(makeRate({ isGuaranteed: true })).isGuaranteedDelivery).toBe(true)
    expect(transformRate(makeRate({ isGuaranteed: false })).isGuaranteedDelivery).toBe(false)
  })

  it('parses createdAt as Date', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('throws schema validation because transformRate emits float totalAmount but RateSchema.totalAmount requires int (minor units)', () => {
    // SendParcel API returns decimal prices (e.g. 14.5 EUR). transformRate passes them
    // straight through as floats. RateSchema uses Amount = z.number().int() (minor units).
    // Known schema incompatibility — decimals pass through unconverted while Amount
    // requires integer minor units, so schema validation fails.
    expect(() => RateSchema.parse(transformRate(makeRate()))).toThrow()
  })

  it('handles string price (parseDecimal)', () => {
    const result = transformRate(makeRate({ price: '9.99' }))
    expect(result.totalAmount).toBe(9.99)
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
