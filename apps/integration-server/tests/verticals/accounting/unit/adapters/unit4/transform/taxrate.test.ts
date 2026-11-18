import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type Unit4TaxRate } from '../../../../../../../src/verticals/accounting/adapters/unit4/transform/taxrate'

function makeTaxRate(overrides: Partial<Unit4TaxRate> = {}): Unit4TaxRate {
  return {
    taxRateId: 'tr_001',
    name: 'Standard VAT',
    rate: 0.2,
    isActive: true,
    ...overrides,
  }
}

describe('transformTaxRate (Unit4)', () => {
  it('maps taxRateId to string id', () => {
    expect(transformTaxRate(makeTaxRate({ taxRateId: 'tr_001' })).id).toBe('tr_001')
  })

  it('maps numeric taxRateId to string', () => {
    expect(transformTaxRate(makeTaxRate({ taxRateId: 3 })).id).toBe('3')
  })

  it('maps name', () => {
    expect(transformTaxRate(makeTaxRate({ name: 'Reduced VAT' })).name).toBe('Reduced VAT')
  })

  it('maps rate', () => {
    expect(transformTaxRate(makeTaxRate({ rate: 0.05 })).rate).toBe(0.05)
  })

  it('maps isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: true })).isActive).toBe(true)
  })

  it('maps isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ isActive: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when absent', () => {
    const raw = makeTaxRate()
    delete raw.isActive
    expect(transformTaxRate(raw).isActive).toBe(true)
  })

  it('passes raw object as metadata by reference', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate({ taxRateId: 'tr_001' }))
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
