import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type QBOTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/quickbooks/transform/taxrate'

function makeTaxRate(overrides: Partial<QBOTaxRate> = {}): QBOTaxRate {
  return {
    Id: 'tax-1',
    Name: 'CA State Tax',
    Description: 'California state sales tax',
    RateValue: 7.25,
    Active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps Id to id correctly', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-1')
  })

  it('maps Name to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('CA State Tax')
  })

  it('maps Description to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('California state sales tax')
  })

  it('maps RateValue to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(7.25)
  })

  it('maps Active true to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ Active: true })).isActive).toBe(true)
  })

  it('maps Active false to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ Active: false })).isActive).toBe(false)
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
