import { describe, it, expect } from 'vitest'
import {
  transformTaxRate,
  type ManagerTaxCode,
} from '../../../../../../../src/verticals/accounting/adapters/manager/transform/taxrate'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'

function makeTaxCode(overrides: Partial<ManagerTaxCode> = {}): ManagerTaxCode {
  return {
    key: 'tax-key-1',
    name: 'GST 10%',
    taxRate: 10,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps key to id', () => {
    expect(transformTaxRate(makeTaxCode()).id).toBe('tax-key-1')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxCode()).name).toBe('GST 10%')
  })

  it('maps name to description as well', () => {
    expect(transformTaxRate(makeTaxCode()).description).toBe('GST 10%')
  })

  it('maps taxRate to rate', () => {
    expect(transformTaxRate(makeTaxCode()).rate).toBe(10)
  })

  it('hardcodes isActive to true', () => {
    // Manager has no active/inactive flag for tax codes
    expect(transformTaxRate(makeTaxCode()).isActive).toBe(true)
  })

  it('passes schema validation', () => {
    expect(() => TaxRateSchema.parse(transformTaxRate(makeTaxCode()))).not.toThrow()
  })
})
