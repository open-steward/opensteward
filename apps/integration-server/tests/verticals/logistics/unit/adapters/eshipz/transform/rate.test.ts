import { describe, it, expect } from 'vitest'
import {
  transformRate,
  type EshipzRate,
} from '../../../../../../../src/verticals/logistics/adapters/eshipz/transform/rate'
import { RateSchema } from '../../../../../../../src/verticals/logistics/schema/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<EshipzRate> = {}): EshipzRate {
  return {
    vendor_id: 7,
    slug: 'bluedart',
    description: 'BlueDart Priority',
    selected_service_type: 'AIR',
    code: 200,
    total: 12000,
    freight_charge: 11500,
    estimated_delivery_days: 2,
    expected_delivery_date: '2024-03-03T00:00:00Z',
    currency: 'INR',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps id from vendor_id (stringified)', () => {
    // String(raw.vendor_id) → id — verified in source
    expect(transformRate(makeRate()).id).toBe('7')
  })

  it('maps carrierId from slug', () => {
    // raw.slug → carrierId — verified in source
    expect(transformRate(makeRate()).carrierId).toBe('bluedart')
  })

  it('maps serviceCode from selected_service_type', () => {
    // raw.selected_service_type → serviceCode — verified in source
    expect(transformRate(makeRate()).serviceCode).toBe('AIR')
  })

  it('maps serviceName from description', () => {
    expect(transformRate(makeRate()).serviceName).toBe('BlueDart Priority')
  })

  it('maps totalAmount from total field', () => {
    // raw.total → totalAmount via parseDecimal — verified in source
    expect(transformRate(makeRate()).totalAmount).toBe(12000)
  })

  it('falls back to freight_charge when total is absent', () => {
    const result = transformRate(makeRate({ total: null }))
    expect(result.totalAmount).toBe(11500)
  })

  it('maps transitDays from estimated_delivery_days ceiled', () => {
    // Math.ceil(parseDecimal(raw.estimated_delivery_days)) → transitDays — verified in source
    expect(transformRate(makeRate()).transitDays).toBe(2)
  })

  it('ceils fractional transitDays', () => {
    expect(transformRate(makeRate({ estimated_delivery_days: '1.3' })).transitDays).toBe(2)
  })

  it('defaults currency to INR when absent', () => {
    // raw.currency ?? 'INR' — verified in source
    expect(transformRate(makeRate({ currency: null })).currency).toBe('INR')
  })

  it('maps estimatedDeliveryAt to Date', () => {
    expect(transformRate(makeRate()).estimatedDeliveryAt).toBeInstanceOf(Date)
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
