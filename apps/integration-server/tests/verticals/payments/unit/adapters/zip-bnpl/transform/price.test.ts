import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/zip-bnpl/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zip-bnpl transformPrice', () => {
  it('maps id, unitAmount, currency and type correctly', () => {
    const raw: RawStripePrice = {
      id: 'zip-pr-001',
      object: 'price',
      product: 'prod-001',
      unit_amount: 2999,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      active: true,
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('zip-pr-001')
    expect(result.unitAmount).toBe(2999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps one_time price without interval', () => {
    const raw: RawStripePrice = {
      id: 'zip-pr-002',
      object: 'price',
      product: 'prod-002',
      unit_amount: 999,
      currency: 'eur',
      type: 'one_time',
      active: true,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(result.currency).toBe('EUR')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
