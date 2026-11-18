import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/zuora/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('zuora transformPrice', () => {
  it('maps id, unitAmount, currency and recurring type', () => {
    const raw: RawStripePrice = {
      id: 'zuora-pr-001',
      object: 'price',
      product: 'zuora-prod-001',
      unit_amount: 4999,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      active: true,
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('zuora-pr-001')
    expect(result.unitAmount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps one_time price without interval', () => {
    const raw: RawStripePrice = {
      id: 'zuora-pr-002',
      object: 'price',
      product: 'zuora-prod-002',
      unit_amount: 1999,
      currency: 'gbp',
      type: 'one_time',
      active: true,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(result.currency).toBe('GBP')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
