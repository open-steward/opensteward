import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type NovaPoshtaRate,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<NovaPoshtaRate> = {}): NovaPoshtaRate {
  return {
    serviceCode: 'standard',
    serviceName: 'Standard Delivery',
    cost: 80,
    deliveryCost: 80,
    totalCost: 100,
    currency: 'UAH',
    estimatedDeliveryDate: '2024-03-05T00:00:00Z',
    transitDays: 4,
    deliveryDays: 3,
    ...overrides,
  }
}

describe('nova-poshta transformRate', () => {
  it('hardcodes carrierId as "nova-poshta"', () => {
    expect(transformRate(makeRate()).carrierId).toBe('nova-poshta')
  })

  it('maps serviceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('standard')
  })

  it('maps serviceName', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Standard Delivery')
  })

  it('prefers totalCost for amount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(100)
  })

  it('falls back amount to cost when totalCost is absent', () => {
    const result = transformRate(makeRate({ totalCost: null }))
    expect(result.totalAmount).toBe(80)
  })

  it('falls back amount to deliveryCost when cost and totalCost are absent', () => {
    const result = transformRate(makeRate({ totalCost: null, cost: null }))
    expect(result.totalAmount).toBe(80)
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('UAH')
  })

  it('defaults currency to "UAH" when absent', () => {
    expect(transformRate(makeRate({ currency: null })).currency).toBe('UAH')
  })

  it('maps transitDays', () => {
    expect(transformRate(makeRate()).transitDays).toBe(4)
  })

  it('maps deliveryDays', () => {
    expect(transformRate(makeRate()).deliveryDays).toBe(3)
  })

  it('maps estimatedDeliveryAt from estimatedDeliveryDate', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes RateSchema.parse without throwing', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
