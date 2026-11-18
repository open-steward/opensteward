import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type VamashipRateResult,
} from '../../../../../../../src/verticals/logistics/adapters/vamaship/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

function makeRateResult(overrides: Partial<VamashipRateResult> = {}): VamashipRateResult {
  return {
    courier_id: 5,
    courier_name: 'Delhivery',
    service_type: 'EXPRESS',
    total_charges: 120,
    freight_charges: 100,
    estimated_delivery_days: 3,
    estimated_delivery_date: '2024-03-04T00:00:00Z',
    cod_charges: 0,
    fuel_surcharge: 20,
    ...overrides,
  }
}

describe('transformRate (vamaship)', () => {
  it('maps id from courier_id as string', () => {
    const result = transformRate(makeRateResult())
    expect(result.id).toBe('5')
  })

  it('maps carrierId and serviceName from courier_name', () => {
    const result = transformRate(makeRateResult())
    expect(result.carrierId).toBe('Delhivery')
    expect(result.serviceName).toBe('Delhivery')
  })

  it('maps serviceCode from service_type', () => {
    const result = transformRate(makeRateResult())
    expect(result.serviceCode).toBe('EXPRESS')
  })

  it('hardcodes currency to INR', () => {
    const result = transformRate(makeRateResult())
    expect(result.currency).toBe('INR')
  })

  it('maps totalAmount from total_charges as decimal', () => {
    const result = transformRate(makeRateResult({ total_charges: 149.5 }))
    expect(result.totalAmount).toBe(149.5)
  })

  it('maps transitDays via Math.ceil from estimated_delivery_days', () => {
    const result = transformRate(makeRateResult({ estimated_delivery_days: 2.7 }))
    expect(result.transitDays).toBe(3)
  })

  it('maps estimatedDeliveryAt as a Date', () => {
    const result = transformRate(makeRateResult())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('leaves transitDays undefined when estimated_delivery_days is null', () => {
    const result = transformRate(makeRateResult({ estimated_delivery_days: null }))
    expect(result.transitDays).toBeUndefined()
  })

  it('passes metadata through as raw object', () => {
    const raw = makeRateResult()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('passes RateSchema.parse without throwing', () => {
    const result = transformRate(makeRateResult())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
