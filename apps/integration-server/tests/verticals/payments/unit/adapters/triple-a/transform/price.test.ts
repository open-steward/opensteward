import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/triple-a/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('triple-a transformPrice', () => {
  it('maps a recurring annual price', () => {
    const raw: RawStripePrice = {
      id: 'price-ta-001',
      object: 'price',
      product: 'prod-ta-001',
      active: true,
      unit_amount: 99900,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'year', interval_count: 1 },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price-ta-001')
    expect(result.unitAmount).toBe(99900)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('year')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one-time price', () => {
    const raw: RawStripePrice = {
      id: 'price-ta-002',
      object: 'price',
      product: 'prod-ta-002',
      active: true,
      unit_amount: 4999,
      currency: 'GBP',
      type: 'one_time',
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.currency).toBe('GBP')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
