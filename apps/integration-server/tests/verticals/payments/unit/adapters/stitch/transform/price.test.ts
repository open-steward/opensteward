import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/stitch/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('stitch transformPrice', () => {
  it('maps id, productId, unitAmount, currency, type, and gateway fields', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_001',
      object: 'price',
      product: 'prod_001',
      unit_amount: 4999,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price_stitch_001')
    expect(result.externalId).toBe('price_stitch_001')
    expect(result.productId).toBe('prod_001')
    expect(result.unitAmount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.gateway).toBe('stripe')
  })

  it('upper-cases currency', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_002',
      object: 'price',
      product: 'prod_002',
      unit_amount: 1000,
      currency: 'eur',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.currency).toBe('EUR')
  })

  it('maps one_time type with no interval', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_003',
      object: 'price',
      product: 'prod_003',
      unit_amount: 2500,
      currency: 'usd',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(result.intervalCount).toBeUndefined()
  })

  it('maps nickname, active, and trialPeriodDays', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_004',
      object: 'price',
      product: 'prod_004',
      nickname: 'Pro Annual',
      active: true,
      unit_amount: 99900,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'year', interval_count: 1, trial_period_days: 30 },
    }
    const result = transformPrice(raw)
    expect(result.nickname).toBe('Pro Annual')
    expect(result.active).toBe(true)
    expect(result.trialPeriodDays).toBe(30)
  })

  it('defaults unitAmount to 0 when unit_amount is null', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_005',
      object: 'price',
      product: 'prod_005',
      unit_amount: null,
      currency: 'usd',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.unitAmount).toBe(0)
  })

  it('converts unix created to ISO string', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_006',
      object: 'price',
      product: 'prod_006',
      unit_amount: 500,
      currency: 'usd',
      type: 'one_time',
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.createdAt).toBe('2024-03-01T00:00:00.000Z')
  })

  it('passes PriceSchema validation', () => {
    const raw: RawStripePrice = {
      id: 'price_stitch_007',
      object: 'price',
      product: 'prod_007',
      nickname: 'Monthly Basic',
      active: true,
      unit_amount: 1499,
      currency: 'gbp',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1, trial_period_days: 0 },
      created: 1709251200,
      metadata: { plan: 'basic' },
    }
    const result = transformPrice(raw)
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
