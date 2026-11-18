import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type SmaccTaxRate } from '../../../../../../../src/verticals/accounting/adapters/smacc/transform/taxrate'

function makeRaw(overrides: Partial<SmaccTaxRate> = {}): SmaccTaxRate {
  return {
    id: 'tax-1',
    name: 'VAT 19%',
    rate: 19,
    is_active: true,
    ...overrides,
  }
}

describe('smacc transformTaxRate', () => {
  it('maps id to id', () => {
    expect(transformTaxRate(makeRaw()).id).toBe('tax-1')
  })

  it('maps name to name', () => {
    expect(transformTaxRate(makeRaw()).name).toBe('VAT 19%')
  })

  it('maps rate to rate', () => {
    expect(transformTaxRate(makeRaw()).rate).toBe(19)
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
