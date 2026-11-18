import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type LexofficeTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/lexoffice/transform/taxrate'

function makeTaxRate(overrides: Partial<LexofficeTaxRate> = {}): LexofficeTaxRate {
  return {
    id: 'tax-uuid-001',
    name: 'Mehrwertsteuer',
    taxRatePercentage: 19,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-uuid-001')
  })

  it('maps name correctly', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Mehrwertsteuer')
  })

  it('maps taxRatePercentage to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(19)
  })

  it('handles reduced tax rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ taxRatePercentage: 7 })).rate).toBe(7)
  })

  it('handles zero tax rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ taxRatePercentage: 0 })).rate).toBe(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
