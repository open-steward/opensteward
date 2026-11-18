import { describe, it, expect } from 'vitest'
import {
  transformRate,
  expandRates,
  type UnifiedShippingRate,
  type UnifiedShippingRateRate,
} from '../../../../../../../src/verticals/logistics/adapters/unified-to-shipping/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRateEntry(overrides: Partial<UnifiedShippingRateRate> = {}): UnifiedShippingRateRate {
  return {
    title: 'USPS Priority Mail',
    amount: 1295,
    baseAmount: 1500,
    currency: 'USD',
    deliveryDays: 2,
    estimatedDeliveryEndAt: '2024-03-04T00:00:00Z',
    isGuaranteed: false,
    ...overrides,
  }
}

function makeRate(overrides: Partial<UnifiedShippingRate> = {}): UnifiedShippingRate {
  return {
    id: 'RATE-U-001',
    carrierId: 'usps',
    currency: 'USD',
    rates: [makeRateEntry()],
    ...overrides,
  }
}

describe('unified-to-shipping transformRate', () => {
  it('maps id', () => {
    expect(transformRate(makeRate()).id).toBe('RATE-U-001')
  })

  it('maps carrierId', () => {
    expect(transformRate(makeRate()).carrierId).toBe('usps')
  })

  it('maps serviceCode from rate entry title', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('USPS Priority Mail')
  })

  it('maps serviceName from rate entry title', () => {
    expect(transformRate(makeRate()).serviceName).toBe('USPS Priority Mail')
  })

  it('maps currency from rate entry', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('maps totalAmount from entry.amount (stored as-is)', () => {
    // Unified.to already provides amounts in the format consumers expect
    expect(transformRate(makeRate()).totalAmount).toBe(1295)
  })

  it('maps retailAmount from entry.baseAmount', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(1500)
  })

  it('maps transitDays from deliveryDays', () => {
    expect(transformRate(makeRate()).transitDays).toBe(2)
  })

  it('maps deliveryDays', () => {
    expect(transformRate(makeRate()).deliveryDays).toBe(2)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(false)
  })

  it('falls back estimatedDeliveryAt to estimatedDeliveryStartAt', () => {
    const entry = makeRateEntry({
      estimatedDeliveryEndAt: null,
      estimatedDeliveryStartAt: '2024-03-03T00:00:00Z',
    })
    expect(transformRate(makeRate(), entry).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes metadata through', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces schema-valid output', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})

describe('unified-to-shipping expandRates', () => {
  it('emits one Rate per entry in rates array', () => {
    const raw = makeRate({
      rates: [makeRateEntry({ title: 'Priority' }), makeRateEntry({ title: 'Ground' })],
    })
    expect(expandRates(raw)).toHaveLength(2)
  })

  it('emits a single Rate when rates is empty', () => {
    const raw = makeRate({ rates: [] })
    expect(expandRates(raw)).toHaveLength(1)
  })

  it('each expanded rate carries the container id', () => {
    const rates = expandRates(makeRate())
    rates.forEach((r) => expect(r.id).toBe('RATE-U-001'))
  })
})
