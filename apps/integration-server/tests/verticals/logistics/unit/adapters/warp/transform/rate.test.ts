import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type WarpQuoteResponse,
} from '../../../../../../../src/verticals/logistics/adapters/warp/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<WarpQuoteResponse> = {}): WarpQuoteResponse {
  return {
    quote_id: 'quote-warp-001',
    mode: 'ltl',
    price_usd: 250.0,
    currency: 'USD',
    transit_days: 3,
    pickup_date: '2024-03-01T00:00:00Z',
    delivery_date: '2024-03-04T00:00:00Z',
    expires_at: '2024-03-01T12:00:00Z',
    quote_tier: 'indicative',
    service: {
      vehicle: 'Pallet LTL',
      pricing: 'market',
    },
    ...overrides,
  }
}

describe('transformRate (warp)', () => {
  it('maps id from quote_id', () => {
    expect(transformRate(makeRaw()).id).toBe('quote-warp-001')
  })

  it('sets carrierId to warp', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('warp')
  })

  it('maps serviceCode from mode', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('ltl')
  })

  it('maps serviceName from service.vehicle', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('Pallet LTL')
  })

  it('falls back serviceName to mode when service.vehicle is absent', () => {
    const result = transformRate(makeRaw({ service: undefined }))
    expect(result.serviceName).toBe('ltl')
  })

  it('maps currency', () => {
    expect(transformRate(makeRaw()).currency).toBe('USD')
  })

  it('defaults currency to USD when absent', () => {
    expect(transformRate(makeRaw({ currency: undefined })).currency).toBe('USD')
  })

  it('converts price_usd to minor units (cents)', () => {
    // $250.00 → 25000 cents
    expect(transformRate(makeRaw()).totalAmount).toBe(25000)
  })

  it('sets totalAmount undefined when price_usd is absent', () => {
    expect(transformRate(makeRaw({ price_usd: undefined })).totalAmount).toBeUndefined()
  })

  it('maps transitDays', () => {
    expect(transformRate(makeRaw()).transitDays).toBe(3)
  })

  it('maps estimatedDeliveryAt from delivery_date', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('sets isGuaranteedDelivery true when quote_tier is firm', () => {
    expect(transformRate(makeRaw({ quote_tier: 'firm' })).isGuaranteedDelivery).toBe(true)
  })

  it('sets isGuaranteedDelivery false when quote_tier is not firm', () => {
    expect(transformRate(makeRaw({ quote_tier: 'indicative' })).isGuaranteedDelivery).toBe(false)
  })

  it('maps createdAt from expires_at', () => {
    expect(transformRate(makeRaw()).createdAt).toBeInstanceOf(Date)
  })

  it('sets metadata to raw object', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against RateSchema', () => {
    expect(() => RateSchema.parse(transformRate(makeRaw()))).not.toThrow()
  })
})
