import { describe, it, expect } from 'vitest'
import { transformCarrierFromRate } from '../../../../../../../src/verticals/logistics/adapters/eshipz/transform/carrier'
import type { EshipzRate } from '../../../../../../../src/verticals/logistics/adapters/eshipz/transform/rate'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRate(overrides: Partial<EshipzRate> = {}): EshipzRate {
  return {
    vendor_id: 42,
    slug: 'delhivery',
    description: 'Delhivery Standard',
    selected_service_type: 'SURFACE',
    code: 200,
    total: 8500,
    currency: 'INR',
    estimated_delivery_days: 3,
    ...overrides,
  }
}

// ─── transformCarrierFromRate ─────────────────────────────────────────────────

describe('transformCarrierFromRate', () => {
  it('maps id from vendor_id (stringified)', () => {
    // String(raw.vendor_id) → id — verified in source
    expect(transformCarrierFromRate(makeRate()).id).toBe('42')
  })

  it('falls back to slug when vendor_id is absent', () => {
    // raw.vendor_id ?? raw.slug → id — verified in source
    expect(transformCarrierFromRate(makeRate({ vendor_id: null })).id).toBe('delhivery')
  })

  it('maps name from description', () => {
    // raw.description → name — verified in source
    expect(transformCarrierFromRate(makeRate()).name).toBe('Delhivery Standard')
  })

  it('falls back name to slug when description is absent', () => {
    expect(transformCarrierFromRate(makeRate({ description: null })).name).toBe('delhivery')
  })

  it('maps code from slug', () => {
    // raw.slug → code — verified in source
    expect(transformCarrierFromRate(makeRate()).code).toBe('delhivery')
  })

  it('is always active', () => {
    expect(transformCarrierFromRate(makeRate()).isActive).toBe(true)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformCarrierFromRate(raw).metadata).toBe(raw)
  })

  it('parses as CarrierSchema without throwing', () => {
    const result = transformCarrierFromRate(makeRate())
    expect(() => CarrierSchema.parse(result)).not.toThrow()
  })
})
