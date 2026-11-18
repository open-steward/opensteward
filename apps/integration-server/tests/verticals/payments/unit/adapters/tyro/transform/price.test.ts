import { describe, it, expect } from 'vitest'
import {
  transformPrice,
  type RawStripePrice,
} from '../../../../../../../src/verticals/payments/adapters/tyro/transform/price'
import { PriceSchema } from '../../../../../../../src/verticals/payments/schema/plan'

describe('tyro transformPrice', () => {
  it('maps a recurring monthly price', () => {
    const raw: RawStripePrice = {
      id: 'price_tyro_001',
      object: 'price',
      product: 'prod_tyro_001',
      nickname: 'POS Monthly',
      active: true,
      unit_amount: 4900,
      currency: 'aud',
      type: 'recurring',
      recurring: {
        interval: 'month',
        interval_count: 1,
      },
      created: 1709251200,
    }
    const result = transformPrice(raw)
    expect(result.id).toBe('price_tyro_001')
    expect(result.productId).toBe('prod_tyro_001')
    expect(result.unitAmount).toBe(4900)
    expect(result.currency).toBe('AUD')
    expect(result.type).toBe('recurring')
    expect(result.interval).toBe('month')
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })

  it('maps a one-time hardware price', () => {
    const raw: RawStripePrice = {
      id: 'price_tyro_002',
      object: 'price',
      product: 'prod_tyro_002',
      active: true,
      unit_amount: 39900,
      currency: 'aud',
      type: 'one_time',
      created: 1709337600,
    }
    const result = transformPrice(raw)
    expect(result.type).toBe('one_time')
    expect(result.interval).toBeUndefined()
    expect(() => PriceSchema.parse(result)).not.toThrow()
  })
})
