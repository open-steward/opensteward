import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ContaAzulTaxRate } from '../../../../../../../src/verticals/accounting/adapters/contaazul/transform/taxrate'

function makeTaxRate(overrides: Partial<ContaAzulTaxRate> = {}): ContaAzulTaxRate {
  return {
    id: 'tax-001',
    name: 'ICMS 18%',
    description: 'Imposto sobre circulacao',
    rate: 18,
    active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('tax-001')
    expect(result.name).toBe('ICMS 18%')
    expect(result.description).toBe('Imposto sobre circulacao')
    expect(result.rate).toBe(18)
    expect(result.isActive).toBe(true)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ active: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
