import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type GophrUkQuoteResponse,
} from '../../../../../../../src/verticals/logistics/adapters/gophr-uk/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeQuote(overrides: Partial<GophrUkQuoteResponse> = {}): GophrUkQuoteResponse {
  return {
    quote_id: 'QT-2024-001',
    price_net: 800,
    price_gross: 960,
    currency: 'GBP',
    delivery_eta_minutes: 90,
    pickup_eta: '2024-03-01T10:00:00Z',
    delivery_eta: '2024-03-01T11:30:00Z',
    service_name: 'Same Day Delivery',
    service_code: 'same_day',
    ...overrides,
  }
}

describe('Gophr UK transformRate', () => {
  it('maps id from quote_id', () => {
    expect(transformRate(makeQuote()).id).toBe('QT-2024-001')
  })

  it('sets carrierId to gophr-uk', () => {
    expect(transformRate(makeQuote()).carrierId).toBe('gophr-uk')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformRate(makeQuote()).serviceCode).toBe('same_day')
  })

  it('defaults serviceCode to gophr-uk when missing', () => {
    expect(transformRate(makeQuote({ service_code: null })).serviceCode).toBe('gophr-uk')
  })

  it('maps serviceName from service_name', () => {
    expect(transformRate(makeQuote()).serviceName).toBe('Same Day Delivery')
  })

  it('defaults serviceName to Gophr UK when missing', () => {
    expect(transformRate(makeQuote({ service_name: null })).serviceName).toBe('Gophr UK')
  })

  it('maps currency from currency field', () => {
    expect(transformRate(makeQuote()).currency).toBe('GBP')
  })

  it('defaults currency to GBP when missing', () => {
    expect(transformRate(makeQuote({ currency: null })).currency).toBe('GBP')
  })

  it('maps totalAmount from price_gross', () => {
    expect(transformRate(makeQuote()).totalAmount).toBe(960)
  })

  it('falls back to price_net when price_gross is null', () => {
    expect(transformRate(makeQuote({ price_gross: null })).totalAmount).toBe(800)
  })

  it('maps estimatedDeliveryAt from delivery_eta', () => {
    expect(transformRate(makeQuote()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('omits estimatedDeliveryAt when delivery_eta is missing', () => {
    expect(transformRate(makeQuote({ delivery_eta: null })).estimatedDeliveryAt).toBeUndefined()
  })

  it('attaches metadata as the raw object', () => {
    const raw = makeQuote()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles minimal quote gracefully', () => {
    const result = transformRate({})
    expect(result.carrierId).toBe('gophr-uk')
    expect(result.currency).toBe('GBP')
    expect(result.totalAmount).toBeUndefined()
  })

  it('produces output that parses against RateSchema', () => {
    const result = transformRate(makeQuote())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
