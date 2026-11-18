import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type CargoOneRate,
} from '../../../../../../../src/verticals/logistics/adapters/cargo-one/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRate(overrides: Partial<CargoOneRate> = {}): CargoOneRate {
  return {
    id: 'rate-001',
    carrier_id: 'lufthansa_cargo',
    carrier_name: 'Lufthansa Cargo',
    service_code: 'AIR_EXPRESS',
    service_name: 'Air Express',
    currency: 'EUR',
    total_amount: 850.0,
    retail_amount: 950.0,
    transit_days: 3,
    estimated_delivery_at: '2024-03-05T00:00:00Z',
    is_guaranteed: true,
    delivery_days: 3,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformRate (cargo-one)', () => {
  it('maps id', () => {
    expect(transformRate(makeRate()).id).toBe('rate-001')
  })

  it('maps carrierId from carrier_id', () => {
    expect(transformRate(makeRate()).carrierId).toBe('lufthansa_cargo')
  })

  it('falls back carrierId to carrier_name when carrier_id is null', () => {
    const result = transformRate(makeRate({ carrier_id: null }))
    expect(result.carrierId).toBe('Lufthansa Cargo')
  })

  it('maps serviceCode', () => {
    expect(transformRate(makeRate()).serviceCode).toBe('AIR_EXPRESS')
  })

  it('maps serviceName', () => {
    expect(transformRate(makeRate()).serviceName).toBe('Air Express')
  })

  it('maps currency', () => {
    expect(transformRate(makeRate()).currency).toBe('EUR')
  })

  it('maps totalAmount', () => {
    expect(transformRate(makeRate()).totalAmount).toBe(850)
  })

  it('maps retailAmount', () => {
    expect(transformRate(makeRate()).retailAmount).toBe(950)
  })

  it('maps transitDays', () => {
    expect(transformRate(makeRate()).transitDays).toBe(3)
  })

  it('maps deliveryDays', () => {
    expect(transformRate(makeRate()).deliveryDays).toBe(3)
  })

  it('maps estimatedDeliveryAt', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(true)
  })

  it('maps createdAt', () => {
    expect(transformRate(makeRate()).createdAt).toBeInstanceOf(Date)
  })

  it('handles null total_amount gracefully', () => {
    expect(transformRate(makeRate({ total_amount: null })).totalAmount).toBeUndefined()
  })

  it('handles string total_amount (parsed as float)', () => {
    const result = transformRate(makeRate({ total_amount: '750.50' }))
    expect(result.totalAmount).toBe(750.5)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('produces output that parses against RateSchema', () => {
    expect(() => RateSchema.parse(transformRate(makeRate()))).not.toThrow()
  })
})
