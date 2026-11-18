import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type EpsilonNetTaxRate } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/taxrate'

function makeTaxRate(overrides: Partial<EpsilonNetTaxRate> = {}): EpsilonNetTaxRate {
  return {
    id: '1',
    name: 'Standard VAT 24%',
    rate: 24,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Standard VAT 24%')
    expect(result.rate).toBe(24)
    expect(result.isActive).toBe(true)
  })

  it('maps reduced rate 13%', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Reduced VAT 13%', rate: 13 }))
    expect(result.rate).toBe(13)
  })

  it('maps super-reduced rate 6%', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Super-reduced VAT 6%', rate: 6 }))
    expect(result.rate).toBe(6)
  })

  it('maps zero rate 0%', () => {
    const result = transformTaxRate(makeTaxRate({ name: 'Zero VAT', rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ isActive: false }))
    expect(result.isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    const result = transformTaxRate(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
