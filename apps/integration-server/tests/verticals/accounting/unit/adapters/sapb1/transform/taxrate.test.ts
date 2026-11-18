import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type SapB1TaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/sapb1/transform/taxrate'

function makeTaxRate(overrides: Partial<SapB1TaxCode> = {}): SapB1TaxCode {
  return {
    Code: 'VAT20',
    Name: 'VAT 20%',
    Rate: 20,
    Active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps Code to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('VAT20')
  })

  it('maps Name to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('VAT 20%')
  })

  it('maps Name to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('VAT 20%')
  })

  it('converts Rate from percentage to decimal fraction', () => {
    expect(transformTaxRate(makeTaxRate({ Rate: 20 })).rate).toBe(0.2)
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
