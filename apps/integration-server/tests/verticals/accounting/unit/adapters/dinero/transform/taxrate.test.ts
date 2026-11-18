import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type DineroTaxRate } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/taxrate'

function makeTaxRate(overrides: Partial<DineroTaxRate> = {}): DineroTaxRate {
  return {
    Id: 'vat-25',
    Name: 'Standard moms',
    Description: '25% dansk moms',
    RatePercent: 25,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps Id to id', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('vat-25')
  })

  it('maps Name to name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('Standard moms')
  })

  it('maps Description to description', () => {
    expect(transformTaxRate(makeTaxRate()).description).toBe('25% dansk moms')
  })

  it('maps RatePercent to rate (divided by 100)', () => {
    expect(transformTaxRate(makeTaxRate({ RatePercent: 25 })).rate).toBe(0.25)
  })

  it('maps zero rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ RatePercent: 0 })).rate).toBe(0)
  })

  it('maps IsActive=true to isActive=true', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: true })).isActive).toBe(true)
  })

  it('maps IsActive=false to isActive=false', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: false })).isActive).toBe(false)
  })

  it('returns undefined name when Name is empty', () => {
    expect(transformTaxRate(makeTaxRate({ Name: '' })).name).toBeUndefined()
  })

  it('returns undefined description when Description is empty', () => {
    expect(transformTaxRate(makeTaxRate({ Description: '' })).description).toBeUndefined()
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
