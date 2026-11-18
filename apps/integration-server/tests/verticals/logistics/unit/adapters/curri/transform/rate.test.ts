import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type CurriQuote,
} from '../../../../../../../src/verticals/logistics/adapters/curri/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuote(o: Partial<CurriQuote> = {}): CurriQuote {
  return {
    id: 'quote-123',
    fee: 1500,
    deliveryMethod: 'Standard',
    duration: 45,
    distance: 12.3,
    priority: 'normal',
    ...o,
  }
}

describe('curri transformRate', () => {
  it('maps carrierId to curri', () => {
    const result = transformRate(makeQuote())
    expect(result.carrierId).toBe('curri')
  })

  it('converts fee from cents to dollars', () => {
    const result = transformRate(makeQuote({ fee: 1500 }))
    expect(result.totalAmount).toBe(15)
  })

  it('sets serviceCode from deliveryMethod', () => {
    const result = transformRate(makeQuote({ deliveryMethod: 'Express' }))
    expect(result.serviceCode).toBe('Express')
  })

  it('sets serviceName from deliveryMethod', () => {
    const result = transformRate(makeQuote({ deliveryMethod: 'Express' }))
    expect(result.serviceName).toBe('Curri Express')
  })

  it('defaults serviceCode to curri when deliveryMethod is null', () => {
    const result = transformRate(makeQuote({ deliveryMethod: null }))
    expect(result.serviceCode).toBe('curri')
  })

  it('defaults serviceName to Curri when deliveryMethod is null', () => {
    const result = transformRate(makeQuote({ deliveryMethod: null }))
    expect(result.serviceName).toBe('Curri')
  })

  it('sets currency to USD', () => {
    const result = transformRate(makeQuote())
    expect(result.currency).toBe('USD')
  })

  it('sets totalAmount to undefined when fee is null', () => {
    const result = transformRate(makeQuote({ fee: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeQuote())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('passes RateSchema validation with minimal input', () => {
    const result = transformRate(makeQuote({ id: null, fee: null, deliveryMethod: null }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
