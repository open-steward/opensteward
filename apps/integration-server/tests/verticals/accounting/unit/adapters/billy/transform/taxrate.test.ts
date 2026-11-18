import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type BillyTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/billy/transform/taxrate'

function makeTaxRate(overrides: Partial<BillyTaxRate> = {}): BillyTaxRate {
  return {
    id: 'tax-001',
    name: 'Standard VAT',
    description: 'Danish 25% VAT',
    rate: 25,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard VAT')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Danish 25% VAT')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(25)
  })

  it('maps isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
  })

  it('maps zero rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ rate: 0 }))
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
