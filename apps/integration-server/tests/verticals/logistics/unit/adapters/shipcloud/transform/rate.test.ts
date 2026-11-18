import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShipcloudQuote,
} from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuote(overrides: Partial<ShipcloudQuote> = {}): ShipcloudQuote {
  return {
    carrier: 'dhl',
    service: 'standard',
    price: 599,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (shipcloud)', () => {
  it('maps carrierId from carrier field', () => {
    expect(transformRate(makeQuote()).carrierId).toBe('dhl')
  })

  it('maps serviceCode from service field', () => {
    expect(transformRate(makeQuote()).serviceCode).toBe('standard')
  })

  it('currency is always EUR', () => {
    expect(transformRate(makeQuote()).currency).toBe('EUR')
  })

  it('maps totalAmount from price', () => {
    // 7.99 EUR → 799 euro-cents; 799 EUR → 79900 euro-cents
    expect(transformRate(makeQuote({ price: 799 })).totalAmount).toBe(79900)
  })

  it('maps createdAt as Date', () => {
    expect(transformRate(makeQuote()).createdAt).toBeInstanceOf(Date)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles null price gracefully', () => {
    expect(transformRate(makeQuote({ price: null })).totalAmount).toBeUndefined()
  })

  it('handles string price', () => {
    // '4.99' parses to 4.99, then converted to minor units: Math.round(4.99 * 100) = 499
    expect(transformRate(makeQuote({ price: '4.99' as unknown as number })).totalAmount).toBe(499)
  })

  it('RateSchema.parse passes when price is a decimal (converted to integer minor-units)', () => {
    // transformRate converts 5.99 EUR → 599 euro-cents, satisfying Amount = z.number().int()
    const result = transformRate(makeQuote({ price: 5.99 }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('RateSchema.parse passes when price is an integer', () => {
    const result = transformRate(makeQuote({ price: 599 }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
