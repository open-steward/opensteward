import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AccurateTaxRate } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/taxrate'

function makeTaxRate(overrides: Partial<AccurateTaxRate> = {}): AccurateTaxRate {
  return {
    id: 5,
    name: 'PPN 11%',
    rate: 11,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('5')
    expect(result.name).toBe('PPN 11%')
    expect(result.rate).toBe(11)
    expect(result.isActive).toBe(true)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles decimal rates', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 1.5 }))
    expect(result.rate).toBe(1.5)
  })

  it('handles zero rate', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 0, name: 'Non-taxable' }))
    expect(result.rate).toBe(0)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
