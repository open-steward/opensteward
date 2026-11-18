import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type FoundationTaxRate } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/taxrate'

function makeTaxRate(overrides: Partial<FoundationTaxRate> = {}): FoundationTaxRate {
  return {
    TaxRateId: 'TAX-1',
    TaxRateName: 'Sales Tax 8%',
    Rate: 8,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('TAX-1')
    expect(result.name).toBe('Sales Tax 8%')
    expect(result.rate).toBe(8)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('maps inactive tax rate correctly', () => {
    const result = transformTaxRate(makeTaxRate({ IsActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when undefined', () => {
    const raw = makeTaxRate()
    ;(raw as Record<string, unknown>)['IsActive'] = undefined
    const result = transformTaxRate(raw)
    expect(result.isActive).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
