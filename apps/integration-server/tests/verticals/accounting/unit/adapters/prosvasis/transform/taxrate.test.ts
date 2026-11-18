import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type ProsvasisTaxRate } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/taxrate'

function makeTaxRate(overrides: Partial<ProsvasisTaxRate> = {}): ProsvasisTaxRate {
  return {
    id: '1',
    Name: 'Standard VAT 24%',
    Rate: 24,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (Prosvasis)', () => {
  it('maps standard 24% rate', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('1')
    expect(result.name).toBe('Standard VAT 24%')
    expect(result.rate).toBe(24)
    expect(result.isActive).toBe(true)
  })

  it('maps reduced 13% rate', () => {
    const result = transformTaxRate(makeTaxRate({ Name: 'Reduced VAT 13%', Rate: 13 }))
    expect(result.rate).toBe(13)
  })

  it('maps super-reduced 6% rate', () => {
    const result = transformTaxRate(makeTaxRate({ Name: 'Super-reduced VAT 6%', Rate: 6 }))
    expect(result.rate).toBe(6)
  })

  it('maps zero rate', () => {
    const result = transformTaxRate(makeTaxRate({ Name: 'Zero VAT', Rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('maps inactive tax rate', () => {
    const result = transformTaxRate(makeTaxRate({ IsActive: false }))
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
