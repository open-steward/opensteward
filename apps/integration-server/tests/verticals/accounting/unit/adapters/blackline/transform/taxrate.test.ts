import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type BlacklineTaxRate } from '../../../../../../../src/verticals/accounting/adapters/blackline/transform/taxrate'

function makeTaxRate(overrides: Partial<BlacklineTaxRate> = {}): BlacklineTaxRate {
  return {
    taxRateId: 'tax-001',
    name: 'US Sales Tax',
    rate: 8.25,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    modifiedAt: '2024-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTaxRate (BlackLine)', () => {
  it('maps id from taxRateId', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('tax-001')
  })

  it('maps name and rate', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.name).toBe('US Sales Tax')
    expect(result.rate).toBe(8.25)
  })

  it('maps isActive', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
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
