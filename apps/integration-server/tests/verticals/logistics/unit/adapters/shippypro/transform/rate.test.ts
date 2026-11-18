import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ShippyProRate,
} from '../../../../../../../src/verticals/logistics/adapters/shippypro/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<ShippyProRate> = {}): ShippyProRate {
  return {
    CarrierId: 5,
    CarrierName: 'DHL',
    ServiceId: 101,
    ServiceName: 'DHL Express',
    Price: '2499',
    Currency: 'USD',
    DeliveryDays: 3,
    EstimatedDeliveryDate: '2024-03-04T00:00:00Z',
    IsGuaranteed: true,
    CreatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (shippypro)', () => {
  it('maps id and serviceCode from ServiceId (coerced to string)', () => {
    const result = transformRate(makeRate())
    expect(result.id).toBe('101')
    expect(result.serviceCode).toBe('101')
  })

  it('maps carrierId from CarrierName (preferred over CarrierId)', () => {
    expect(transformRate(makeRate()).carrierId).toBe('DHL')
  })

  it('falls back to string CarrierId when CarrierName is null', () => {
    expect(transformRate(makeRate({ CarrierName: null })).carrierId).toBe('5')
  })

  it('maps serviceName, currency and totalAmount', () => {
    const result = transformRate(makeRate())
    expect(result.serviceName).toBe('DHL Express')
    expect(result.currency).toBe('USD')
    expect(result.totalAmount).toBe(2499)
  })

  it('maps both transitDays and deliveryDays from DeliveryDays', () => {
    const result = transformRate(makeRate())
    expect(result.transitDays).toBe(3)
    expect(result.deliveryDays).toBe(3)
  })

  it('maps estimatedDeliveryAt and isGuaranteedDelivery', () => {
    const result = transformRate(makeRate())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes RateSchema.parse without throwing', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })

  it('id is undefined when ServiceId is null', () => {
    const result = transformRate(makeRate({ ServiceId: null }))
    expect(result.id).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
  })

  it('handles Price as numeric', () => {
    expect(transformRate(makeRate({ Price: 1500 })).totalAmount).toBe(1500)
  })

  it('sets metadata to raw input', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
