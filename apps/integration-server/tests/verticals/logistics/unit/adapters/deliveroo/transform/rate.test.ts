import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type DeliverooQuoteRaw,
} from '../../../../../../../src/verticals/logistics/adapters/deliveroo/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuote(overrides: Partial<DeliverooQuoteRaw> = {}): DeliverooQuoteRaw {
  return {
    id: 'quote-abc',
    fee_fractional: 250,
    currency: 'GBP',
    estimated_delivery_time: '2024-03-01T13:00:00Z',
    expires_at: '2024-03-01T11:15:00Z',
    restaurant_id: 'rest-456',
    ...overrides,
  }
}

describe('deliveroo transformRate', () => {
  it('maps id', () => {
    const result = transformRate(makeQuote())
    expect(result.id).toBe('quote-abc')
  })

  it('sets carrierId to deliveroo', () => {
    const result = transformRate(makeQuote())
    expect(result.carrierId).toBe('deliveroo')
  })

  it('sets serviceCode to deliveroo_courier', () => {
    const result = transformRate(makeQuote())
    expect(result.serviceCode).toBe('deliveroo_courier')
  })

  it('maps fee_fractional to totalAmount', () => {
    const result = transformRate(makeQuote())
    expect(result.totalAmount).toBe(250)
  })

  it('maps currency', () => {
    const result = transformRate(makeQuote())
    expect(result.currency).toBe('GBP')
  })

  it('maps estimated_delivery_time to estimatedDeliveryAt', () => {
    const result = transformRate(makeQuote())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.estimatedDeliveryAt?.toISOString()).toBe('2024-03-01T13:00:00.000Z')
  })

  it('passes schema validation', () => {
    const result = transformRate(makeQuote())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('drops currency when not 3 chars', () => {
    const result = transformRate(makeQuote({ currency: 'GB' }))
    expect(result.currency).toBeUndefined()
  })

  it('handles null fee_fractional', () => {
    const result = transformRate(makeQuote({ fee_fractional: null }))
    expect(result.totalAmount).toBeUndefined()
  })
})
