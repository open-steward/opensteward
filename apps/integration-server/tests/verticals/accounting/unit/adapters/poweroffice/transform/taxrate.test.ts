import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type PowerOfficeTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/poweroffice/transform/taxrate'

function makeTaxCode(overrides: Partial<PowerOfficeTaxCode> = {}): PowerOfficeTaxCode {
  return {
    id: 10,
    code: 'VAT25',
    description: 'Standard VAT 25%',
    vatRate: 25,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    expect(transformTaxRate(makeTaxCode()).id).toBe('10')
  })

  it('maps description to name', () => {
    expect(transformTaxRate(makeTaxCode()).name).toBe('Standard VAT 25%')
  })

  it('maps description to description', () => {
    expect(transformTaxRate(makeTaxCode()).description).toBe('Standard VAT 25%')
  })

  it('maps vatRate to rate', () => {
    expect(transformTaxRate(makeTaxCode()).rate).toBe(25)
  })

  it('maps isActive true correctly', () => {
    expect(transformTaxRate(makeTaxCode({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive false correctly', () => {
    expect(transformTaxRate(makeTaxCode({ isActive: false })).isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxCode()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxCode())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
