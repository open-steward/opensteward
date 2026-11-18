import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type LoggiQuoteOption,
} from '../../../../../../../src/verticals/logistics/adapters/loggi/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRaw(overrides: Partial<LoggiQuoteOption> = {}): LoggiQuoteOption {
  return {
    serviceType: 'STANDARD',
    serviceName: 'Loggi Standard',
    totalAmount: 1500,
    currency: 'BRL',
    transitDays: 3,
    estimatedDeliveryDate: '2024-03-04T00:00:00Z',
    isGuaranteed: false,
    ...overrides,
  }
}

describe('loggi transformRate', () => {
  it('sets carrierId to loggi', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('loggi')
  })

  it('maps serviceCode from serviceType', () => {
    expect(transformRate(makeRaw({ serviceType: 'EXPRESS' })).serviceCode).toBe('EXPRESS')
  })

  it('maps serviceName', () => {
    expect(transformRate(makeRaw({ serviceName: 'Loggi Express' })).serviceName).toBe(
      'Loggi Express',
    )
  })

  it('maps currency', () => {
    expect(transformRate(makeRaw({ currency: 'BRL' })).currency).toBe('BRL')
  })

  it('defaults currency to BRL when null', () => {
    expect(transformRate(makeRaw({ currency: null })).currency).toBe('BRL')
  })

  it('maps totalAmount as integer', () => {
    // parseDecimal(1500) = 1500 which passes Amount = z.number().int()
    expect(transformRate(makeRaw({ totalAmount: 1500 })).totalAmount).toBe(1500)
  })

  it('maps transitDays', () => {
    expect(transformRate(makeRaw({ transitDays: 3 })).transitDays).toBe(3)
  })

  it('maps deliveryDays same as transitDays', () => {
    const result = transformRate(makeRaw({ transitDays: 5 }))
    expect(result.deliveryDays).toBe(5)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    const result = transformRate(makeRaw({ estimatedDeliveryDate: '2024-03-04T00:00:00Z' }))
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRaw({ isGuaranteed: true })).isGuaranteedDelivery).toBe(true)
  })

  it('metadata is the raw object', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
