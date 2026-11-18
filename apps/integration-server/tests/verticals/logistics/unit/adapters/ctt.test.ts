import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type CttRate,
} from '../../../../../src/verticals/logistics/adapters/ctt/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<CttRate> = {}): CttRate {
  return {
    service_code: 'EXPRESSO',
    service_name: 'CTT Expresso',
    currency: 'EUR',
    total_amount: 8.5,
    estimated_delivery_days: 2,
    estimated_delivery_date: '2024-03-17T00:00:00Z',
    guaranteed: true,
    ...overrides,
  }
}

// ─── transformRate ──────────────────────────────────────────────────────────

describe('CTT transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRate()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('ctt')
    expect(result.serviceCode).toBe('EXPRESSO')
    expect(result.serviceName).toBe('CTT Expresso')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(8.5)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      service_name: null,
      estimated_delivery_days: null,
      estimated_delivery_date: null,
    })
    const result = transformRate(raw)

    expect(result.serviceName).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })
})
