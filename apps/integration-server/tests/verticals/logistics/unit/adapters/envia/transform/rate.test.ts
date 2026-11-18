import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type EnviaRate,
} from '../../../../../../../src/verticals/logistics/adapters/envia/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<EnviaRate> = {}): EnviaRate {
  return {
    carrier: 'fedex',
    service: 'FEDEX_GROUND',
    serviceDescription: 'FedEx Ground',
    currency: 'MXN',
    totalPrice: 310.5,
    basePrice: 280.0,
    deliveryDays: 3,
    deliveryDate: '2024-03-04T00:00:00Z',
    guaranteed: true,
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps carrierId and serviceCode', () => {
    const result = transformRate(makeRate())
    // raw.carrier → carrierId, raw.service → serviceCode — verified in source
    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('FEDEX_GROUND')
  })

  it('maps serviceName from serviceDescription', () => {
    // raw.serviceDescription → serviceName — verified in source
    expect(transformRate(makeRate()).serviceName).toBe('FedEx Ground')
  })

  it('maps currency and totalAmount (minor units)', () => {
    const result = transformRate(makeRate())
    expect(result.currency).toBe('MXN')
    expect(result.totalAmount).toBe(31050)
  })

  it('maps retailAmount from basePrice (minor units)', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(28000)
  })

  it('maps deliveryDays and transitDays from deliveryDays', () => {
    const result = transformRate(makeRate())
    // raw.deliveryDays → deliveryDays AND transitDays — verified in source
    expect(result.deliveryDays).toBe(3)
    expect(result.transitDays).toBe(3)
  })

  it('maps estimatedDeliveryAt to Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(true)
  })

  it('handles missing optional fields', () => {
    const result = transformRate(
      makeRate({
        carrier: null,
        service: null,
        totalPrice: null,
        deliveryDays: null,
        deliveryDate: null,
      }),
    )
    expect(result.carrierId).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
