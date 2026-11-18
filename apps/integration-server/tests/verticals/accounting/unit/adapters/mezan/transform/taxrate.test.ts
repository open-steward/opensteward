import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type MezanTaxType,
} from '../../../../../../../src/verticals/accounting/adapters/mezan/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxType(overrides: Partial<MezanTaxType> = {}): MezanTaxType {
  return {
    id: 'tax_001',
    internal_name: 'standard_vat',
    display_name: 'Standard VAT',
    percent: 15.0,
    is_sales_enabled: true,
    is_purchasing_enabled: true,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (mezan)', () => {
  it('maps id as string', () => {
    expect(transformTaxRate(makeTaxType()).id).toBe('tax_001')
  })

  it('maps display_name to name', () => {
    expect(transformTaxRate(makeTaxType()).name).toBe('Standard VAT')
  })

  it('falls back to internal_name when display_name is absent', () => {
    const result = transformTaxRate(makeTaxType({ display_name: undefined }))
    expect(result.name).toBe('standard_vat')
  })

  it('maps internal_name to description', () => {
    expect(transformTaxRate(makeTaxType()).description).toBe('standard_vat')
  })

  it('maps percent to rate', () => {
    expect(transformTaxRate(makeTaxType()).rate).toBe(15.0)
  })

  it('maps is_active', () => {
    expect(transformTaxRate(makeTaxType({ is_active: false })).isActive).toBe(false)
  })

  it('passes raw object as metadata', () => {
    const raw = makeTaxType()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('passes TaxRateSchema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxType()))).not.toThrow()
  })
})
