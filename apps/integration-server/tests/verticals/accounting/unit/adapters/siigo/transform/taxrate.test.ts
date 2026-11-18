import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type SiigoTaxRate } from '../../../../../../../src/verticals/accounting/adapters/siigo/transform/taxrate'

function makeTaxRate(overrides: Partial<SiigoTaxRate> = {}): SiigoTaxRate {
  return {
    id: 50,
    name: 'IVA 19%',
    description: 'Impuesto al valor agregado',
    percentage: 19,
    active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('50')
    expect(result.name).toBe('IVA 19%')
    expect(result.description).toBe('Impuesto al valor agregado')
    expect(result.rate).toBe(19)
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
