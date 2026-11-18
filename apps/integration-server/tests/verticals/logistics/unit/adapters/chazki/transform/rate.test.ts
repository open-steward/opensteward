import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type ChazkiRate,
} from '../../../../../../../src/verticals/logistics/adapters/chazki/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<ChazkiRate> = {}): ChazkiRate {
  return {
    id: 'rate-001',
    carrier: 'chazki',
    service: 'EXPRESS',
    service_name: 'Chazki Express',
    currency: 'PEN',
    // Use integer minor-unit amounts to satisfy Amount (safeint) in RateSchema.
    amount: 2550,
    retail_price: 3000,
    transit_days: 2,
    delivery_days: 2,
    estimated_delivery_date: '2024-03-01T00:00:00Z',
    guaranteed: true,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── Core field mapping ───────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps all core fields correctly', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('rate-001')
    expect(result.carrierId).toBe('chazki')
    expect(result.serviceCode).toBe('EXPRESS')
    expect(result.serviceName).toBe('Chazki Express')
    expect(result.currency).toBe('PEN')
    expect(result.totalAmount).toBe(2550)
    expect(result.retailAmount).toBe(3000)
    expect(result.transitDays).toBe(2)
    expect(result.deliveryDays).toBe(2)
    expect(result.isGuaranteedDelivery).toBe(true)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes RateSchema validation', () => {
    const result = transformRate(makeRate())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  // ─── Amount fallbacks ────────────────────────────────────────────────────────

  it('uses price when amount is null', () => {
    const result = transformRate(makeRate({ amount: null, price: 2000 }))
    expect(result.totalAmount).toBe(2000)
  })

  it('uses total when amount and price are null', () => {
    const result = transformRate(makeRate({ amount: null, price: null, total: 1800 }))
    expect(result.totalAmount).toBe(1800)
  })

  it('returns undefined totalAmount when amount, price, and total are all null', () => {
    const result = transformRate(makeRate({ amount: null, price: null, total: null }))
    expect(result.totalAmount).toBeUndefined()
  })

  // ─── Service name fallback ───────────────────────────────────────────────────

  it('falls back to service for serviceName when service_name is null', () => {
    const result = transformRate(makeRate({ service_name: null }))
    expect(result.serviceName).toBe('EXPRESS')
  })

  // ─── Service code fallback ───────────────────────────────────────────────────

  it('falls back to service_type for serviceCode when service is null', () => {
    const result = transformRate(makeRate({ service: null, service_type: 'STANDARD' }))
    expect(result.serviceCode).toBe('STANDARD')
  })

  // ─── Default carrierId ───────────────────────────────────────────────────────

  it('defaults carrierId to chazki when carrier is null', () => {
    const result = transformRate(makeRate({ carrier: null }))
    expect(result.carrierId).toBe('chazki')
  })

  // ─── Optional fields ─────────────────────────────────────────────────────────

  it('returns undefined retailAmount when retail_price is null', () => {
    const result = transformRate(makeRate({ retail_price: null }))
    expect(result.retailAmount).toBeUndefined()
  })

  it('returns undefined estimatedDeliveryAt when estimated_delivery_date is null', () => {
    const result = transformRate(makeRate({ estimated_delivery_date: null }))
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })

  it('maps guaranteed: false correctly', () => {
    const result = transformRate(makeRate({ guaranteed: false }))
    expect(result.isGuaranteedDelivery).toBe(false)
  })

  it('returns undefined isGuaranteedDelivery when guaranteed is null', () => {
    const result = transformRate(makeRate({ guaranteed: null }))
    expect(result.isGuaranteedDelivery).toBeUndefined()
  })
})
