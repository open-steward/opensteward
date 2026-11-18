import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/interswitch/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('interswitch transformPrice', () => {
  it('maps a recurring price correctly', () => {
    const raw: RawStripePrice = {
      id: 'price-001',
      object: 'price',
      product: 'prod-001',
      nickname: 'Monthly Recurring',
      active: true,
      unit_amount: 4999,
      currency: 'usd',
      type: 'recurring',
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price-001')
    expect(result.productId).toBe('prod-001')
    expect(result.unitAmount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price', () => {
    const raw: RawStripePrice = {
      id: 'price-002',
      object: 'price',
      product: 'prod-002',
      unit_amount: 1000,
      currency: 'eur',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.currency).toBe('EUR')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
