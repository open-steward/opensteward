import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type CenterTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/taxrate'

function makeTaxRate(overrides: Partial<CenterTaxRate> = {}): CenterTaxRate {
  return {
    id: 'tax-001',
    name: 'GST',
    percentage: 5,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('GST')
  })

  it('converts percentage to decimal rate (percentage/100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 5 })).rate).toBe(0.05)
  })

  it('converts 13% percentage to 0.13 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 13 })).rate).toBe(0.13)
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

  it('handles HST tax rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 15 })).rate).toBe(0.15)
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
