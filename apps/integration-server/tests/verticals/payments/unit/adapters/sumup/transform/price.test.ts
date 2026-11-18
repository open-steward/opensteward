import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/sumup/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('sumup transformPrice', () => {
  it('maps id, productId, unitAmount, currency, type and gateway', () => {
    const raw: RawStripePrice = {
      id: 'price_001',
      object: 'price',
      product: 'prod_abc',
      unit_amount: 4999,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      active: true,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price_001')
    expect(result.externalId).toBe('price_001')
    expect(result.productId).toBe('prod_abc')
    expect(result.unitAmount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price without recurring', () => {
    const raw: RawStripePrice = {
      id: 'price_002',
      object: 'price',
      product: 'prod_xyz',
      unit_amount: 9900,
      currency: 'eur',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.currency).toBe('EUR')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('defaults unitAmount to 0 when null', () => {
    const raw: RawStripePrice = {
      id: 'price_003',
      object: 'price',
      product: 'prod_xyz',
      unit_amount: null,
      currency: 'usd',
      type: 'one_time',
    }
    expect(transformPrice(raw).unitAmount).toBe(0)
  })

  it('maps nickname and trialPeriodDays from recurring', () => {
    const raw: RawStripePrice = {
      id: 'price_004',
      object: 'price',
      product: 'prod_abc',
      currency: 'usd',
      type: 'recurring',
      nickname: 'Monthly Pro',
      recurring: { interval: 'month', trial_period_days: 7 },
    }
    const result = transformPrice(raw)
    expect(result.nickname).toBe('Monthly Pro')
    expect(result.trialPeriodDays).toBe(7)
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps createdAt from unix timestamp', () => {
    const raw: RawStripePrice = {
      id: 'price_005',
      object: 'price',
      product: 'prod_abc',
      currency: 'usd',
      type: 'one_time',
      created: 1709251200,
    }
    expect(transformPrice(raw).createdAt).toBe('2024-03-01T00:00:00.000Z')
  })
})
