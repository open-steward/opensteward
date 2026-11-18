import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type IntacctTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/sageintacct/transform/taxrate'

function makeTaxRate(overrides: Partial<IntacctTaxRate> = {}): IntacctTaxRate {
  return {
    RECORDNO: 'tax-1',
    NAME: 'Standard VAT',
    DESCRIPTION: 'Standard rate VAT 20%',
    RATE: '0.20',
    STATUS: 'active',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps RECORDNO to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-1')
  })

  it('maps NAME to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps DESCRIPTION to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Standard rate VAT 20%')
  })

  it('parses RATE as a number', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(0.2)
  })

  it('maps STATUS active to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ STATUS: 'active' })).isActive).toBe(true)
  })

  it('maps STATUS inactive to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ STATUS: 'inactive' })).isActive).toBe(false)
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
