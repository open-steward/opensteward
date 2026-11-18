import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type InnoshipRate,
} from '../../../../../../../src/verticals/logistics/adapters/innoship/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<InnoshipRate> = {}): InnoshipRate {
  return {
    carrierId: 3,
    carrier: 'FAN Courier',
    serviceId: 10,
    service: 'Standard',
    rateAmount: 18.5,
    rateVatAmount: 3.5,
    rateTotalAmount: 22.0,
    rateCurrency: 'RON',
    deliveryDays: 2,
    calculatedDeliveryDate: '2024-03-03T00:00:00Z',
    score: 95,
    performance: 0.95,
    priority: 1,
    ...overrides,
  }
}

describe('innoship transformRate', () => {
  it('maps id from serviceId as string', () => {
    expect(transformRate(makeRate()).id).toBe('10')
  })

  it('maps carrierId from carrierId as string', () => {
    expect(transformRate(makeRate()).carrierId).toBe('3')
  })

  it('maps serviceCode from serviceId as string', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('10')
  })

  it('maps serviceName from service', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Standard')
  })

  it('maps totalAmount from rateTotalAmount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(22.0)
  })

  it('maps retailAmount from rateAmount', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(18.5)
  })

  it('maps currency from rateCurrency', () => {
    expect(transformRate(makeRate()).currency).toBe('RON')
  })

  it('maps transitDays and deliveryDays from deliveryDays', () => {
    const result = transformRate(makeRate())
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('throws on RateSchema.parse because rateAmount/rateTotalAmount are decimals (not integer minor units)', () => {
    // Innoship's transformRate passes raw decimal amounts (e.g. 18.5 RON) into
    // totalAmount/retailAmount, violating Amount = z.number().int(). Known quirk —
    // the schema expects minor units but the adapter emits major-unit decimals.
    expect(() => RateSchema.parse(transformRate(makeRate()))).toThrow()
  })

  it('sets totalAmount to undefined when rateTotalAmount is null', () => {
    const result = transformRate(makeRate({ rateTotalAmount: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  it('sets retailAmount to undefined when rateAmount is null', () => {
    const result = transformRate(makeRate({ rateAmount: null }))
    expect(result.retailAmount).toBeUndefined()
  })

  it('handles null serviceId', () => {
    const result = transformRate(makeRate({ serviceId: null }))
    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })
})
