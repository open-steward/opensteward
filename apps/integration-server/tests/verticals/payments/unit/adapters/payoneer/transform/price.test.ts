import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/payoneer/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('payoneer transformPrice', () => {
  it('maps a recurring monthly price', () => {
    const raw: RawStripePrice = {
      id: 'price_001',
      object: 'price',
      product: 'prod_001',
      nickname: 'Pro Monthly',
      active: true,
      unit_amount: 9900,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      created: 1709251200,
    }

    const result = transformPrice(raw)

    expect(result.id).toBe('price_001')
    expect(result.productId).toBe('prod_001')
    expect(result.unitAmount).toBe(9900)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price', () => {
    const raw: RawStripePrice = {
      id: 'price_002',
      object: 'price',
      product: 'prod_002',
      active: true,
      unit_amount: 4999,
      currency: 'EUR',
      type: 'one_time',
      created: 1709251200,
    }

    const result = transformPrice(raw)

    expect(result.type).toBe('one_time')
    expect(result.currency).toBe('EUR')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
