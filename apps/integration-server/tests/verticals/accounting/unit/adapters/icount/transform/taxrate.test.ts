import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, ICOUNT_TAX_RATES, type ICountTaxRate } from '../../../../../../../src/verticals/accounting/adapters/icount/transform/taxrate'

function makeTaxRate(overrides: Partial<ICountTaxRate> = {}): ICountTaxRate {
  return {
    id: 'vat_17',
    name: 'VAT 17%',
    rate: 17,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (icount)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('vat_17')
    expect(result.name).toBe('VAT 17%')
    expect(result.rate).toBe(17)
    expect(result.isActive).toBe(true)
  })

  it('maps 0% rate', () => {
    const result = transformTaxRate(makeTaxRate({ id: 'vat_0', name: 'VAT Exempt 0%', rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('ICOUNT_TAX_RATES includes 17% and 0%', () => {
    expect(ICOUNT_TAX_RATES).toHaveLength(2)
    expect(ICOUNT_TAX_RATES.find((r) => r.rate === 17)).toBeDefined()
    expect(ICOUNT_TAX_RATES.find((r) => r.rate === 0)).toBeDefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
