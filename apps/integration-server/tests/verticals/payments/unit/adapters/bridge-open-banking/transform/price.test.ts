import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/bridge-open-banking/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('bridge-open-banking transformPrice', () => {
  it('maps a recurring price', () => {
    const raw: RawStripePrice = {
      id: 'price-001',
      object: 'price',
      product: 'prod-001',
      nickname: 'Monthly Pro',
      active: true,
      unit_amount: 2500,
      currency: 'usd',
      type: 'recurring',
      recurring: {
        interval: 'month',
        interval_count: 1,
        trial_period_days: 7,
      },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price-001')
    expect(result.productId).toBe('prod-001')
    expect(result.unitAmount).toBe(2500)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.trialPeriodDays).toBe(7)
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price', () => {
    const raw: RawStripePrice = {
      id: 'price-002',
      object: 'price',
      product: 'prod-002',
      active: true,
      unit_amount: 4999,
      currency: 'eur',
      type: 'one_time',
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
