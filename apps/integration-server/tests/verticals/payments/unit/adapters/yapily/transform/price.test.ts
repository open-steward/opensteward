import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/yapily/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('yapily transformPrice (stripe-scaffold)', () => {
  it('maps a recurring monthly price', () => {
    const raw: RawStripePrice = {
      id: 'price-001',
      object: 'price',
      product: 'prod-001',
      nickname: 'Monthly Pro',
      active: true,
      unit_amount: 5000,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.unitAmount).toBe(5000)
    expect(result.currency).toBe('USD')
    expect(result.interval).toBe('month')
    expect(result.intervalCount).toBe(1)
    expect(result.type).toBe('recurring')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price', () => {
    const raw: RawStripePrice = {
      id: 'price-002',
      object: 'price',
      product: 'prod-002',
      active: true,
      unit_amount: 2500,
      currency: 'gbp',
      type: 'one_time',
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
