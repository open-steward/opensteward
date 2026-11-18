import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type UhasibuTaxRate } from '../../../../../../../src/verticals/accounting/adapters/uhasibu/transform/taxrate'

function makeRaw(overrides: Partial<UhasibuTaxRate> = {}): UhasibuTaxRate {
  return {
    id: 'utr-1',
    name: 'VAT 16%',
    rate: 16,
    is_active: true,
    ...overrides,
  }
}

describe('uhasibu transformTaxRate', () => {
  it('maps id to id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('utr-1')
  })

  it('maps name to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('VAT 16%')
  })

  it('maps rate to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(16)
  })

  it('maps is_active=true to isActive=true', () => {
    expect(transformTaxRate(makeRaw({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false to isActive=false', () => {
    expect(transformTaxRate(makeRaw({ is_active: false })).isActive).toBe(false)
  })

  it('defaults isActive=true when is_active absent', () => {
    expect(transformTaxRate(makeRaw({ is_active: undefined })).isActive).toBe(true)
  })

  it('handles missing optional fields gracefully', () => {
    expect(() => transformTaxRate(makeRaw())).not.toThrow()
  })

  it('preserves raw metadata by reference', () => {
    const raw = makeRaw()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeRaw())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
