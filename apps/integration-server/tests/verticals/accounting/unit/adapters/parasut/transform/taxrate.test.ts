import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, getStaticTaxRates, type ParasutTaxRate } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/taxrate'

function makeTaxRate(overrides: Partial<ParasutTaxRate> = {}): ParasutTaxRate {
  return {
    id: 'vat_20',
    name: 'KDV %20',
    rate: 20,
    ...overrides,
  }
}

describe('transformTaxRate (parasut)', () => {
  it('maps id and name correctly', () => {
    const t = transformTaxRate(makeTaxRate())
    expect(t.id).toBe('vat_20')
    expect(t.name).toBe('KDV %20')
  })

  it('maps rate correctly', () => {
    expect(transformTaxRate(makeTaxRate()).rate).toBe(20)
  })

  it('sets isActive to true', () => {
    expect(transformTaxRate(makeTaxRate()).isActive).toBe(true)
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

describe('getStaticTaxRates (parasut)', () => {
  it('returns 4 Turkish VAT rates', () => {
    const rates = getStaticTaxRates()
    expect(rates).toHaveLength(4)
  })

  it('includes 20%, 10%, 1%, 0% rates', () => {
    const rates = getStaticTaxRates()
    const rateValues = rates.map((r) => r.rate)
    expect(rateValues).toContain(20)
    expect(rateValues).toContain(10)
    expect(rateValues).toContain(1)
    expect(rateValues).toContain(0)
  })

  it('all rates are active', () => {
    expect(getStaticTaxRates().every((r) => r.isActive === true)).toBe(true)
  })
})
