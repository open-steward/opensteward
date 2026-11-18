import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import {
  transformTaxRate,
  type BexioTaxRate,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/taxrate'

function makeTaxRate(overrides: Partial<BexioTaxRate> = {}): BexioTaxRate {
  return {
    id: 701,
    name: 'MwSt 8.1%',
    percentage: 8.1,
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('701')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('MwSt 8.1%')
  })

  it('converts percentage to decimal rate (divides by 100)', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 8.1 })).rate).toBeCloseTo(0.081)
  })

  it('maps 0 percentage to 0 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 0 })).rate).toBe(0)
  })

  it('maps 100 percentage to 1.0 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 100 })).rate).toBe(1)
  })

  it('maps 25 percentage to 0.25 rate', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: 25 })).rate).toBe(0.25)
  })

  it('maps is_active true to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active false to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
  })

  it('returns undefined name when empty', () => {
    expect(transformTaxRate(makeTaxRate({ name: '' })).name).toBeUndefined()
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
