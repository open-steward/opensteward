import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/spoton/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('spoton transformPrice', () => {
  it('maps a recurring price', () => {
    const raw: RawStripePrice = {
      id: 'price_spoton_1',
      object: 'price',
      product: 'prod_1',
      nickname: 'Monthly Pro',
      active: true,
      unit_amount: 4999,
      currency: 'usd',
      type: 'recurring',
      recurring: { interval: 'month', interval_count: 1 },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price_spoton_1')
    expect(result.unitAmount).toBe(4999)
    expect(result.currency).toBe('USD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(result.productId).toBe('prod_1')
    expect(result.gateway).toBe('stripe')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one_time price', () => {
    const raw: RawStripePrice = {
      id: 'price_spoton_2',
      object: 'price',
      product: 'prod_2',
      active: true,
      unit_amount: 9900,
      currency: 'eur',
      type: 'one_time',
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(result.currency).toBe('EUR')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('defaults unitAmount to 0 when unit_amount is null', () => {
    const raw: RawStripePrice = {
      id: 'price_spoton_3',
      object: 'price',
      product: 'prod_3',
      unit_amount: null,
      currency: 'gbp',
      type: 'one_time',
    }
    const result = transformPrice(raw)
    expect(result.unitAmount).toBe(0)
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
