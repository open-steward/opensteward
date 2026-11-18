import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type ZohoBooksTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/zohobooks/transform/taxrate'

function makeTaxRate(overrides: Partial<ZohoBooksTaxRate> = {}): ZohoBooksTaxRate {
  return {
    tax_id: 'tax-001',
    tax_name: 'Standard VAT',
    tax_percentage: 20,
    is_default: true,
    is_inactive: false,
    tax_type: 'tax',
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps tax_id to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps tax_name to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps tax_percentage to rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('maps is_inactive false to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ is_inactive: false })).isActive).toBe(true)
  })

  it('maps is_inactive true to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ is_inactive: true })).isActive).toBe(false)
  })

  it('maps a zero tax_percentage correctly', () => {
    expect(transformTaxRate(makeTaxRate({ tax_percentage: 0 })).rate).toBe(0)
  })

  it('maps a reduced tax_percentage correctly', () => {
    expect(transformTaxRate(makeTaxRate({ tax_percentage: 5 })).rate).toBe(5)
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
