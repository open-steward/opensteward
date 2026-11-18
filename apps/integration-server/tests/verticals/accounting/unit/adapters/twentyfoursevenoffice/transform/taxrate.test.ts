import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type TwentyFourSevenTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/taxrate'

function makeTaxRate(overrides: Partial<TwentyFourSevenTaxRate> = {}): TwentyFourSevenTaxRate {
  return {
    id: 'tax-001',
    name: 'Standard MVA',
    description: 'Norwegian 25% VAT',
    percentage: 25,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id from raw id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard MVA')
  })

  it('maps description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('Norwegian 25% VAT')
  })

  it('converts percentage to decimal rate (percentage / 100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 25 })).rate).toBe(0.25)
  })

  it('converts zero percentage to zero rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('converts 12 percentage to 0.12 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 12 })).rate).toBe(0.12)
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

  it('returns undefined description when description is empty', () => {
    expect(transformTaxRate(makeTaxRate({ description: '' })).description).toBeUndefined()
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
