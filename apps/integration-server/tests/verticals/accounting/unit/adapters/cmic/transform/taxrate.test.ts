import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type CmicTaxRate } from '../../../../../../../src/verticals/accounting/adapters/cmic/transform/taxrate'

function makeTaxRate(overrides: Partial<CmicTaxRate> = {}): CmicTaxRate {
  return {
    TaxRateId: 'TAX-001',
    Name: 'HST Ontario',
    Rate: 13,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (CMiC)', () => {
  it('maps id from TaxRateId', () => {
    expect(transformTaxRate(makeTaxRate()).id).toBe('TAX-001')
  })

  it('maps name and rate', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.name).toBe('HST Ontario')
    expect(result.rate).toBe(13)
  })

  it('maps isActive', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeTaxRate({ IsActive: false })).isActive).toBe(false)
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
