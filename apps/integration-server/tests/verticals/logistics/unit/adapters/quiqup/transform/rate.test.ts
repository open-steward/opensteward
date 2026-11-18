import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type QuiqupRate,
} from '../../../../../../../src/verticals/logistics/adapters/quiqup/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeRaw(overrides: Partial<QuiqupRate> = {}): QuiqupRate {
  return {
    id: 'rate-qq-001',
    service_type: 'SAME_DAY',
    service_name: 'Quiqup Same Day',
    currency: 'AED',
    total_amount: 35.5,
    transit_days: 0,
    estimated_delivery_at: '2024-03-01T18:00:00Z',
    is_guaranteed: true,
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('Quiqup transformRate', () => {
  it('maps carrierId to quiqup', () => {
    expect(transformRate(makeRaw()).carrierId).toBe('quiqup')
  })

  it('maps id, serviceCode, serviceName, currency', () => {
    const result = transformRate(makeRaw())
    expect(result.id).toBe('rate-qq-001')
    expect(result.serviceCode).toBe('SAME_DAY')
    expect(result.serviceName).toBe('Quiqup Same Day')
    expect(result.currency).toBe('AED')
  })

  it('maps total_amount to totalAmount in integer minor units', () => {
    // 35.5 AED → Math.round(35.5 * 100) = 3550 fils
    const result = transformRate(makeRaw())
    expect(result.totalAmount).toBe(3550)
  })

  it('maps transit_days to both transitDays and deliveryDays', () => {
    const result = transformRate(makeRaw())
    expect(result.transitDays).toBe(0)
    expect(result.deliveryDays).toBe(0)
  })

  it('maps is_guaranteed to isGuaranteedDelivery', () => {
    const result = transformRate(makeRaw({ is_guaranteed: true }))
    expect(result.isGuaranteedDelivery).toBe(true)
  })

  it('parses estimated_delivery_at to Date', () => {
    const result = transformRate(makeRaw())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('parses created_at to Date', () => {
    const result = transformRate(makeRaw())
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('handles null optional fields gracefully', () => {
    const result = transformRate(makeRaw({ id: null, total_amount: null, transit_days: null }))
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.transitDays).toBeUndefined()
  })

  it('passes RateSchema.parse because totalAmount is converted to integer minor units', () => {
    // 35.5 AED → Math.round(35.5 * 100) = 3550 fils (integer), satisfies z.number().int()
    const result = transformRate(makeRaw())
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('passes RateSchema.parse when totalAmount is an integer', () => {
    const result = transformRate(makeRaw({ total_amount: 100 }))
    expect(() => RateSchema.parse(result)).not.toThrow()
  })

  it('preserves raw as metadata', () => {
    const raw = makeRaw()
    expect(transformRate(raw).metadata).toBe(raw)
  })
})
