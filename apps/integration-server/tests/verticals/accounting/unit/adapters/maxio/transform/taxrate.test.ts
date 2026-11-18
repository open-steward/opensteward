import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type MaxioTaxRate } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/taxrate'

function makeTaxRate(overrides: Partial<MaxioTaxRate> = {}): MaxioTaxRate {
  return {
    id: 5,
    name: 'US Sales Tax',
    percentage: '8.5',
    is_active: true,
    ...overrides,
  }
}

describe('transformTaxRate (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('5')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate()).name).toBe('US Sales Tax')
  })

  it('converts percentage string to number', () => {
    expect(transformTaxRate(makeTaxRate({ percentage: '8.5' })).rate).toBe(8.5)
  })

  it('maps is_active true', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: true })).isActive).toBe(true)
  })

  it('maps is_active false', () => {
    expect(transformTaxRate(makeTaxRate({ is_active: false })).isActive).toBe(false)
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
