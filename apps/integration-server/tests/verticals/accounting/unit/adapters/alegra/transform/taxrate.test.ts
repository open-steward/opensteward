import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AlegraTaxRate } from '../../../../../../../src/verticals/accounting/adapters/alegra/transform/taxrate'

function makeTaxRate(overrides: Partial<AlegraTaxRate> = {}): AlegraTaxRate {
  return {
    id: 2,
    name: 'IVA 19%',
    description: 'Impuesto al valor agregado 19%',
    percentage: 19,
    status: 'active',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id to string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('2')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('IVA 19%')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Impuesto al valor agregado 19%')
  })

  it('maps percentage to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(19)
  })

  it('maps active status to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ status: 'active' })).isActive).toBe(true)
  })

  it('maps inactive status to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ status: 'inactive' })).isActive).toBe(false)
  })

  it('maps zero rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ percentage: 0, name: 'Exempt' }))
    expect(result.rate).toBe(0)
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
