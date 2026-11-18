import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type AccountsIQTaxRate } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/taxrate'

function makeTaxRate(overrides: Partial<AccountsIQTaxRate> = {}): AccountsIQTaxRate {
  return {
    taxRateId: '1',
    taxRateName: 'Standard Rate 23%',
    taxRatePercent: 23,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Standard Rate 23%')
    expect(result.rate).toBe(23)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('maps isActive false correctly', () => {
    const result = transformTaxRate(makeTaxRate({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('defaults isActive to true when isActive is undefined', () => {
    const raw = makeTaxRate()
    // @ts-expect-error intentional
    delete raw.isActive
    const result = transformTaxRate(raw)
    expect(result.isActive).toBe(true)
  })

  it('maps zero percent tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ taxRatePercent: 0, taxRateName: 'Zero Rated' }))
    expect(result.rate).toBe(0)
    expect(result.name).toBe('Zero Rated')
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
