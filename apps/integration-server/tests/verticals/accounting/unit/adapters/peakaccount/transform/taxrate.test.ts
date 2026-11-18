import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type PeakAccountTaxRate } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/taxrate'

function makeTaxRate(overrides: Partial<PeakAccountTaxRate> = {}): PeakAccountTaxRate {
  return {
    id: 'TAX-001',
    name: 'Thai VAT 7%',
    rate: 7,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('TAX-001')
    expect(result.name).toBe('Thai VAT 7%')
    expect(result.rate).toBe(7)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps zero rate (export VAT)', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'VAT 0% Export', rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
