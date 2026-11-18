import { describe, it, expect } from 'vitest'
import {
  listCarriers,
  getCarrier,
} from '../../../../../../../src/verticals/logistics/adapters/sendparcel/transform/carrier'
import { CarrierSchema } from '../../../../../../../src/verticals/logistics/schema/carrier'

// ─── listCarriers ─────────────────────────────────────────────────────────────

describe('listCarriers', () => {
  it('returns a non-empty array of carrier records', () => {
    const carriers = listCarriers()
    expect(carriers.length).toBeGreaterThan(0)
  })

  it('each carrier passes CarrierSchema validation', () => {
    const carriers = listCarriers()
    for (const carrier of carriers) {
      expect(() => CarrierSchema.parse(carrier)).not.toThrow()
    }
  })

  it('includes well-known carriers (dhl, tnt, fedex)', () => {
    const ids = listCarriers().map((c) => c.id)
    expect(ids).toContain('dhl')
    expect(ids).toContain('tnt')
    expect(ids).toContain('fedex')
  })

  it('sets isActive to true for all carriers', () => {
    const carriers = listCarriers()
    expect(carriers.every((c) => c.isActive === true)).toBe(true)
  })

  it('includes services array on each carrier', () => {
    const carriers = listCarriers()
    for (const carrier of carriers) {
      expect(Array.isArray(carrier.services)).toBe(true)
      expect((carrier.services ?? []).length).toBeGreaterThan(0)
    }
  })
})

// ─── getCarrier ───────────────────────────────────────────────────────────────

describe('getCarrier', () => {
  it('returns the DHL carrier by id', () => {
    const carrier = getCarrier('dhl')
    expect(carrier).toBeDefined()
    expect(carrier!.name).toBe('DHL')
    expect(carrier!.code).toBe('dhl')
  })

  it('passes CarrierSchema for a known carrier', () => {
    const carrier = getCarrier('dpd')
    expect(() => CarrierSchema.parse(carrier)).not.toThrow()
  })

  it('returns undefined for unknown id', () => {
    expect(getCarrier('does-not-exist')).toBeUndefined()
  })

  it('includes metadata with source=static', () => {
    const carrier = getCarrier('dhl')
    expect(carrier?.metadata?.source).toBe('static')
  })
})
