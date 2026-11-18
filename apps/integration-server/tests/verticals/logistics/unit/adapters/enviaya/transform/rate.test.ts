import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type EnviaYaRateResult,
} from '../../../../../../../src/verticals/logistics/adapters/enviaya/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<EnviaYaRateResult> = {}): EnviaYaRateResult {
  return {
    carrier: 'fedex',
    carrier_name: 'FedEx Mexico',
    carrier_service_code: 'FEDEX_ECONOMY',
    carrier_service_name: 'FedEx Economy',
    total_amount: 450.0,
    net_total_amount: 380.0,
    currency: 'MXN',
    estimated_delivery: '2024-03-05T00:00:00Z',
    transit_days: 4,
    guaranteed: false,
    rate_id: 'rate-ey-001',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps id from rate_id', () => {
    // raw.rate_id → id — verified in source
    expect(transformRate(makeRate()).id).toBe('rate-ey-001')
  })

  it('maps carrierId and serviceCode', () => {
    const result = transformRate(makeRate())
    // raw.carrier → carrierId — verified in source
    expect(result.carrierId).toBe('fedex')
    expect(result.serviceCode).toBe('FEDEX_ECONOMY')
  })

  it('maps serviceName from carrier_service_name', () => {
    // raw.carrier_service_name → serviceName — verified in source
    expect(transformRate(makeRate()).serviceName).toBe('FedEx Economy')
  })

  it('falls back serviceName to carrier_name when service name absent', () => {
    const result = transformRate(makeRate({ carrier_service_name: null }))
    expect(result.serviceName).toBe('FedEx Mexico')
  })

  it('maps totalAmount and retailAmount', () => {
    const result = transformRate(makeRate())
    expect(result.totalAmount).toBe(450.0)
    expect(result.retailAmount).toBe(380.0)
  })

  it('defaults currency to MXN when absent', () => {
    // currency ?? 'MXN' — verified in source
    expect(transformRate(makeRate({ currency: null })).currency).toBe('MXN')
  })

  it('maps transitDays and deliveryDays from transit_days', () => {
    const result = transformRate(makeRate())
    // raw.transit_days → transitDays AND deliveryDays — verified in source
    expect(result.transitDays).toBe(4)
    expect(result.deliveryDays).toBe(4)
  })

  it('falls back transitDays to estimated_delivery_days', () => {
    const result = transformRate(makeRate({ transit_days: null, estimated_delivery_days: 5 }))
    expect(result.transitDays).toBe(5)
  })

  it('rounds fractional transit days', () => {
    const result = transformRate(makeRate({ transit_days: 3.7 }))
    expect(result.transitDays).toBe(4)
  })

  it('maps estimatedDeliveryAt to Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps isGuaranteedDelivery', () => {
    expect(transformRate(makeRate()).isGuaranteedDelivery).toBe(false)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('parses as RateSchema without throwing', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })
})
