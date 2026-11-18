import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AcumaticaTaxRate } from '../../../../../../../src/verticals/accounting/adapters/acumatica/transform/taxrate'

function makeTaxRate(overrides: Partial<AcumaticaTaxRate> = {}): AcumaticaTaxRate {
  return {
    TaxID: 'TAX001',
    Descr: 'Standard VAT 20%',
    TaxRate: 20,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (Acumatica)', () => {
  it('maps id from TaxID', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('TAX001')
  })

  it('maps name from Descr', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT 20%')
  })

  it('maps rate from TaxRate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('maps isActive from IsActive', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeTaxRate({ IsActive: false })).isActive).toBe(false)
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
