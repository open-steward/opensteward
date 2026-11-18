import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type MoloniTaxRate } from '../../../../../../../src/verticals/accounting/adapters/moloni/transform/taxrate'

function makeTaxRate(overrides: Partial<MoloniTaxRate> = {}): MoloniTaxRate {
  return {
    tax_id: 3,
    name: 'IVA 23%',
    value: 23,
    type: 1,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('3')
    expect(result.name).toBe('IVA 23%')
    expect(result.rate).toBe(23)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate({ name: 'IVA 6%' })
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps reduced rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ value: 6, name: 'IVA 6%' }))
    expect(result.rate).toBe(6)
  })

  it('returns undefined name when name is empty', () => {
    const result = transformTaxRate(makeTaxRate({ name: '' }))
    expect(result.name).toBeUndefined()
  })

  it('maps fixed type (2) correctly', () => {
    const result = transformTaxRate(makeTaxRate({ type: 2, value: 5 }))
    expect(result.rate).toBe(5)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
