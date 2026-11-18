import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShippifyRate,
} from '../../../../../../../src/verticals/logistics/adapters/shippify/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<ShippifyRate> = {}): ShippifyRate {
  return {
    id: 'rate-007',
    name: 'Express Delivery',
    totalPrice: 1250,
    price: 1000,
    currency: 'USD',
    pickupStart: '2024-03-01T00:00:00Z',
    dropoffEnd: '2024-03-03T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (shippify)', () => {
  it('maps id and serviceName', () => {
    const result = transformRate(makeRate())
    expect(result.id).toBe('rate-007')
    expect(result.serviceName).toBe('Express Delivery')
  })

  it('prefers totalPrice over price for totalAmount', () => {
    const result = transformRate(makeRate())
    expect(result.totalAmount).toBe(1250)
  })

  it('falls back to price when totalPrice is absent', () => {
    const result = transformRate(makeRate({ totalPrice: null }))
    expect(result.totalAmount).toBe(1000)
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('maps estimatedDeliveryAt from dropoffEnd', () => {
    const result = transformRate(makeRate())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes RateSchema.parse without throwing', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })

  it('handles all optional fields absent gracefully', () => {
    const result = transformRate({})
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBeUndefined()
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('sets metadata to raw input', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
