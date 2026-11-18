import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type GlovoEstimate,
} from '../../../../../../../src/verticals/logistics/adapters/glovo/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeEstimate(overrides: Partial<GlovoEstimate> = {}): GlovoEstimate {
  return {
    total: { amount: 850, currency: 'EUR' },
    deliveryTime: 45,
    estimatedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('Glovo transformRate', () => {
  it('sets carrierId to glovo', () => {
    expect(transformRate(makeEstimate()).carrierId).toBe('glovo')
  })

  it('sets serviceCode to on_demand', () => {
    expect(transformRate(makeEstimate()).serviceCode).toBe('on_demand')
  })

  it('sets serviceName to Glovo On-Demand', () => {
    expect(transformRate(makeEstimate()).serviceName).toBe('Glovo On-Demand')
  })

  it('maps currency from total.currency', () => {
    expect(transformRate(makeEstimate()).currency).toBe('EUR')
  })

  it('maps totalAmount from total.amount', () => {
    expect(transformRate(makeEstimate()).totalAmount).toBe(850)
  })

  it('converts deliveryTime minutes to days via Math.ceil', () => {
    // 45 minutes → Math.ceil(45 / 60 / 24) = Math.ceil(0.03125) = 1
    expect(transformRate(makeEstimate({ deliveryTime: 45 })).transitDays).toBe(1)
  })

  it('converts 1440 minutes (exactly 1 day) to 1 day', () => {
    expect(transformRate(makeEstimate({ deliveryTime: 1440 })).transitDays).toBe(1)
  })

  it('converts 1441 minutes to 2 days', () => {
    expect(transformRate(makeEstimate({ deliveryTime: 1441 })).transitDays).toBe(2)
  })

  it('sets transitDays undefined when deliveryTime is null', () => {
    expect(transformRate(makeEstimate({ deliveryTime: null })).transitDays).toBeUndefined()
  })

  it('maps createdAt from estimatedAt', () => {
    const result = transformRate(makeEstimate())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeEstimate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing total gracefully', () => {
    const result = transformRate(makeEstimate({ total: null }))
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces output that parses against RateSchema', () => {
    const result = transformRate(makeEstimate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
