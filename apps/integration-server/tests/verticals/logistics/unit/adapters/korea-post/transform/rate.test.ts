import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type KoreaPostRateRaw,
} from '../../../../../../../src/verticals/logistics/adapters/korea-post/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<KoreaPostRateRaw> = {}): KoreaPostRateRaw {
  return {
    id: 'kp-rate-1',
    service_code: 'EMS',
    service_name: 'EMS International',
    currency: 'KRW',
    total: 18000,
    retail_amount: 20000,
    transit_days: 3,
    delivery_days: 3,
    estimated_delivery_at: '2026-09-20T00:00:00Z',
    is_guaranteed: true,
    created_at: '2026-09-13T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (korea-post)', () => {
  it('maps id from id', () => {
    expect(transformRate(makeRaw()).id).toBe('kp-rate-1')
  })

  it('sets carrierId to korea-post', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('korea-post')
  })

  it('maps serviceCode from service_code', () => {
    expect(transformRate(makeRaw()).serviceCode).toBe('EMS')
  })

  it('falls back serviceCode to code when service_code is absent', () => {
    expect(transformRate(makeRaw({ service_code: null, code: 'EMS-ALT' })).serviceCode).toBe('EMS-ALT')
  })

  it('maps serviceName from service_name', () => {
    expect(transformRate(makeRaw()).serviceName).toBe('EMS International')
  })

  it('defaults currency to KRW when absent', () => {
    expect(transformRate(makeRaw({ currency: null })).currency).toBe('KRW')
  })

  it('maps totalAmount from total', () => {
    expect(transformRate(makeRaw()).totalAmount).toBe(18000)
  })

  it('falls back totalAmount to amount when total is absent', () => {
    expect(transformRate(makeRaw({ total: null, amount: 17000 })).totalAmount).toBe(17000)
  })

  it('maps retailAmount from retail_amount', () => {
    expect(transformRate(makeRaw()).retailAmount).toBe(20000)
  })

  it('maps transitDays and deliveryDays', () => {
    const rate = transformRate(makeRaw())
    expect(rate.transitDays).toBe(3)
    expect(rate.deliveryDays).toBe(3)
  })

  it('maps estimatedDeliveryAt to a Date', () => {
    expect(transformRate(makeRaw()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery from is_guaranteed', () => {
    expect(transformRate(makeRaw()).isGuaranteedDelivery).toBe(true)
  })

  it('passes metadata as the original raw object', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against RateSchema', () => {
    expect(() => RateSchema.parse(transformRate(makeRaw()))).not.toThrow()
  })

  it('produces output that parses against RateSchema on a sparse raw record', () => {
    expect(() => RateSchema.parse(transformRate({}))).not.toThrow()
  })
})
