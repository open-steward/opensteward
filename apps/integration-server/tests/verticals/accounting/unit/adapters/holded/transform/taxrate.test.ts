import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type HoldedTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/taxrate'

function makeTaxRate(overrides: Partial<HoldedTaxRate> = {}): HoldedTaxRate {
  return {
    id: 'tax-001',
    name: 'IVA General',
    percentage: 21,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('IVA General')
  })

  it('converts percentage to decimal rate (percentage/100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 21 })).rate).toBe(0.21)
  })

  it('converts 10% percentage to 0.10 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 10 })).rate).toBe(0.10)
  })

  it('converts 0% percentage to 0 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
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
