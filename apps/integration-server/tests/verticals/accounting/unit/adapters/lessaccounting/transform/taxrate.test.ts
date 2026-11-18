import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type LessAccountingTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/lessaccounting/transform/taxrate'

function makeTaxRate(overrides: Partial<LessAccountingTaxRate> = {}): LessAccountingTaxRate {
  return {
    id: 'tax-001',
    name: 'Sales Tax',
    percentage: 8.5,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Sales Tax')
  })

  it('converts percentage to decimal rate (percentage/100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 8.5 })).rate).toBeCloseTo(0.085)
  })

  it('converts 10% percentage to 0.10 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 10 })).rate).toBe(0.10)
  })

  it('converts 0% percentage to 0 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps is_active=true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active=false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('returns undefined name when name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
  })

  it('handles reduced tax rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 4 })).rate).toBe(0.04)
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
