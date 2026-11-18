import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type FreightifyRate,
} from '../../../../../../../src/verticals/logistics/adapters/freightify/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<FreightifyRate> = {}): FreightifyRate {
  return {
    id: 'rate-001',
    carrier_name: 'Maersk',
    carrier_scac: 'MAEU',
    service_code: 'FCL-40HC',
    service_name: 'Maersk FCL 40HC',
    currency: 'USD',
    total_amount: 4500,
    base_amount: 4000,
    transit_days: 18,
    estimated_delivery: '2024-03-20T00:00:00Z',
    is_guaranteed: false,
    valid_from: '2024-03-01T00:00:00Z',
    valid_until: '2024-03-31T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('freightify transformRate', () => {
  it('maps id correctly', () => {
    expect(transformRate(makeRate()).id).toBe('rate-001')
  })

  it('maps carrierId from carrier_scac', () => {
    expect(transformRate(makeRate()).carrierId).toBe('MAEU')
  })

  it('falls back carrierId to carrier_name when scac missing', () => {
    expect(transformRate(makeRate({ carrier_scac: null })).carrierId).toBe('Maersk')
  })

  it('maps serviceCode and serviceName', () => {
    const result = transformRate(makeRate())
    expect(result.serviceCode).toBe('FCL-40HC')
    expect(result.serviceName).toBe('Maersk FCL 40HC')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('USD')
  })

  it('maps totalAmount from total_amount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(4500)
  })

  it('maps retailAmount from base_amount', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(4000)
  })

  it('maps transitDays and deliveryDays', () => {
    const result = transformRate(makeRate())
    expect(result.transitDays).toBe(18)
    expect(result.deliveryDays).toBe(18)
  })

  it('maps estimatedDeliveryAt as Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(false)
  })

  it('maps createdAt as Date', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('handles string total_amount', () => {
    expect(transformRate(makeRate({ total_amount: '3750.50' })).totalAmount).toBe(3750.5)
  })

  it('handles null amounts gracefully', () => {
    const result = transformRate(makeRate({ total_amount: null, base_amount: null }))
    expect(result.totalAmount).toBeUndefined()
    expect(result.retailAmount).toBeUndefined()
  })

  it('passes RateSchema validation', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
