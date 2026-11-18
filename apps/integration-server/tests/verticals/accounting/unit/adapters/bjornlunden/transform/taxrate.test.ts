import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type BlTaxRate } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/taxrate'

function makeTaxRate(overrides: Partial<BlTaxRate> = {}): BlTaxRate {
  return {
    Id: 'tax-uuid-1234',
    Name: 'Standard VAT',
    Description: 'Standard Swedish VAT rate',
    Rate: 25,
    IsActive: true,
    ...overrides,
  }
}

describe('transformTaxRate', () => {
  it('maps id correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('tax-uuid-1234')
  })

  it('maps name', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.name).toBe('Standard VAT')
  })

  it('maps description', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.description).toBe('Standard Swedish VAT rate')
  })

  it('divides rate by 100 to get decimal', () => {
    const result = transformTaxRate(makeTaxRate({ Rate: 25 }))
    expect(result.rate).toBe(0.25)
  })

  it('handles 0% rate', () => {
    const result = transformTaxRate(makeTaxRate({ Rate: 0 }))
    expect(result.rate).toBe(0)
  })

  it('handles 12% rate', () => {
    const result = transformTaxRate(makeTaxRate({ Rate: 12 }))
    expect(result.rate).toBeCloseTo(0.12)
  })

  it('handles 6% rate', () => {
    const result = transformTaxRate(makeTaxRate({ Rate: 6 }))
    expect(result.rate).toBeCloseTo(0.06)
  })

  it('maps isActive', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive: true })).isActive).toBe(true)
    expect(transformTaxRate(makeTaxRate({ IsActive: false })).isActive).toBe(false)
  })

  it('returns undefined for empty string fields', () => {
    const result = transformTaxRate(makeTaxRate({ Name: '', Description: '' }))
    expect(result.name).toBeUndefined()
    expect(result.description).toBeUndefined()
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
