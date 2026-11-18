import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type CertiniaTaxRate } from '../../../../../../../src/verticals/accounting/adapters/certinia/transform/taxrate'

function makeTaxRate(overrides: Partial<CertiniaTaxRate> = {}): CertiniaTaxRate {
  return {
    Id: 'TAX000000001',
    Name: 'VAT 20%',
    Rate__c: 20,
    IsActive__c: true,
    ...overrides,
  }
}

describe('transformTaxRate (Certinia)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('TAX000000001')
    expect(result.name).toBe('VAT 20%')
    expect(result.rate).toBe(20)
    expect(result.isActive).toBe(true)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('maps inactive tax rate correctly', () => {
    expect(transformTaxRate(makeTaxRate({ IsActive__c: false })).isActive).toBe(false)
  })

  it('defaults isActive to true when undefined', () => {
    const raw = makeTaxRate()
    ;(raw as Record<string, unknown>)['IsActive__c'] = undefined
    expect(transformTaxRate(raw).isActive).toBe(true)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
