import { describe, it, expect } from 'vitest'
import { TaxRateSchema } from '../../../../../../../src/verticals/accounting/schema/taxrate'
import { transformTaxRate, type XeroTaxRate } from '../../../../../../../src/verticals/accounting/adapters/xero/transform/taxrate'

function makeTaxRate(overrides: Partial<XeroTaxRate> = {}): XeroTaxRate {
  return {
    Name: 'Standard Rate',
    TaxType: 'OUTPUT2',
    CanApplyToAssets: false,
    CanApplyToEquity: false,
    CanApplyToExpenses: true,
    CanApplyToLiabilities: false,
    CanApplyToRevenue: true,
    DisplayTaxRate: 20,
    EffectiveRate: 20,
    Status: 'ACTIVE',
    TaxComponents: [{ Name: 'VAT', Rate: 20, IsCompound: false }],
    ...overrides,
  }
}

describe('transformTaxRate (Xero)', () => {
  it('maps core fields correctly', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(result.id).toBe('OUTPUT2')
    expect(result.name).toBe('Standard Rate')
    expect(result.rate).toBe(20)
  })

  it('uses TaxType as id', () => {
    expect(transformTaxRate(makeTaxRate({ TaxType: 'ZERORATEDGOODS' })).id).toBe('ZERORATEDGOODS')
  })

  it('uses EffectiveRate as rate', () => {
    expect(transformTaxRate(makeTaxRate({ EffectiveRate: 5 })).rate).toBe(5)
  })

  it('maps ACTIVE status to isActive true', () => {
    expect(transformTaxRate(makeTaxRate({ Status: 'ACTIVE' })).isActive).toBe(true)
  })

  it('maps DELETED status to isActive false', () => {
    expect(transformTaxRate(makeTaxRate({ Status: 'DELETED' })).isActive).toBe(false)
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTaxRate()
    expect(transformTaxRate(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTaxRate(makeTaxRate())
    expect(() => TaxRateSchema.parse(result)).not.toThrow()
  })
})
