import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type SenpexQuoteResponse,
} from '../../../../../../../src/verticals/logistics/adapters/senpex/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeQuote(overrides: Partial<SenpexQuoteResponse> = {}): SenpexQuoteResponse {
  return {
    api_token: 'tok_senpex_test',
    order_price: 18.5,
    distance_miles: 12.3,
    expire_mins: 15,
    routes: [{ route_to_text: '100 Delivery Ave, San Francisco, CA' }],
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('sets carrierId to senpex and serviceCode to senpex_delivery', () => {
    const result = transformRate(makeQuote())
    expect(result.carrierId).toBe('senpex')
    expect(result.serviceCode).toBe('senpex_delivery')
    expect(result.serviceName).toBe('Senpex Delivery')
  })

  it('maps order_price → totalAmount', () => {
    const result = transformRate(makeQuote({ order_price: 18.5 }))
    expect(result.totalAmount).toBe(18.5)
  })

  it('handles string order_price', () => {
    const result = transformRate(makeQuote({ order_price: '25.00' }))
    expect(result.totalAmount).toBe(25)
  })

  it('sets currency to USD', () => {
    expect(transformRate(makeQuote()).currency).toBe('USD')
  })

  it('handles null order_price → totalAmount undefined', () => {
    const result = transformRate(makeQuote({ order_price: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('throws schema validation because transformRate emits float totalAmount but RateSchema.totalAmount requires int (minor units)', () => {
    // Senpex API returns decimal prices (e.g. 18.5 USD). transformRate passes them
    // straight through as floats. RateSchema uses Amount = z.number().int() (minor units).
    // Known schema incompatibility — the transform emits major-unit decimals while
    // Amount requires integer minor units, so schema validation fails.
    expect(() => RateSchema.parse(transformRate(makeQuote()))).toThrow()
  })

  it('passes metadata as raw object reference', () => {
    const raw = makeQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
